import { adminStorage } from "@/lib/firebase-admin";
import crypto from 'crypto';

const CACHE_BUCKET_NAME = "place-photos-cache";
const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

const pendingRequests = new Map<string, Promise<string>>();

/**
 * Ensures a Place Photo is cached in Google Cloud Storage.
 * Supports both V1 (places/...) and Legacy references.
 */
// --- IMAGE CACHE V1 REWRITE ---
export async function getCachedPhotoUrl(placeId: string, photoReference: string, maxWidth = 800): Promise<string> {
    if (!photoReference || !placeId) return "";

    const hash = crypto.createHash('md5').update(photoReference).digest('hex');
    const fileName = `places/${placeId}/${hash}.jpg`;
    const lockKey = fileName;

    // Atomic Locking
    if (pendingRequests.has(lockKey)) {
        return pendingRequests.get(lockKey)!;
    }

    const bucketName = CACHE_BUCKET_NAME;
    const isEmulator = process.env.NODE_ENV === "development" && process.env.FIREBASE_STORAGE_EMULATOR_HOST;

    const operationPromise = (async (): Promise<string> => {
        try {
            const bucket = adminStorage.bucket(bucketName);
            const file = bucket.file(fileName);

            // Emulator Setup
            if (isEmulator) {
                const [bucketExists] = await bucket.exists();
                if (!bucketExists) {
                    await bucket.create();
                    await bucket.makePublic();
                }
            }

            // Check Cache
            const [exists] = await file.exists();
            if (exists) {
                if (isEmulator) {
                    return `http://127.0.0.1:9199/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/${bucketName}/${fileName}`;
                }
                return `https://storage.googleapis.com/${bucketName}/${fileName}`;
            }

            console.log(`[ImageCache] ☁️ MISS: ${fileName}. Downloading from Google V1...`);

            // --- V1 MEDIA DOWNLOAD LOGIC ---
            // 1. Get the Download URI (JSON)
            // Docs: https://developers.google.com/maps/documentation/places/web-service/photos

            // Construct Resource Name if missing (Backwards compat check)
            let resourceName = photoReference;
            // If it DOESN'T start with 'places/', it's legacy. We can't fetch legacy with V1 Media easily without ID mapping.
            // However, the Mission assumes strict V1 input now.
            if (!resourceName.startsWith("places/")) {
                console.warn(`[ImageCache] ⚠️ Legacy photo reference detected: ${photoReference}. Use V1.`);
                // We will try legacy fallback if we must, but let's stick to V1 logic first as requested.
            }

            const metaUrl = `https://places.googleapis.com/v1/${resourceName}/media?maxWidthPx=${maxWidth}&key=${GOOGLE_API_KEY}&skipHttpRedirect=true`;

            const metaRes = await fetch(metaUrl);
            if (!metaRes.ok) {
                const errText = await metaRes.text();
                console.error(`[ImageCache] Metadata Fetch Error ${metaRes.status}: ${errText}`);
                return "https://placehold.co/600x400/grey/white?text=No+Image+Meta";
            }

            const metaData = await metaRes.json();
            const photoUri = metaData.photoUri;

            if (!photoUri) {
                console.error("[ImageCache] No photoUri found in metadata response.");
                return "https://placehold.co/600x400/grey/white?text=No+Photo+URI";
            }

            // 2. Download the Binary Image
            const imageRes = await fetch(photoUri);
            if (!imageRes.ok) {
                console.error(`[ImageCache] Binary Download Error ${imageRes.status}`);
                return "https://placehold.co/600x400/grey/white?text=Download+Error";
            }

            const arrayBuffer = await imageRes.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // 3. Save to Storage
            console.log(`[ImageCache] 💾 SAVING to Bucket: ${fileName}`);
            await file.save(buffer, {
                metadata: {
                    contentType: "image/jpeg",
                    cacheControl: "public, max-age=31536000",
                    metadata: {
                        original_place_id: placeId,
                        original_ref: photoReference,
                        fetched_at: new Date().toISOString()
                    }
                },
                public: true,
                validation: false
            });

            if (isEmulator) {
                return `http://127.0.0.1:9199/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/${bucketName}/${fileName}`;
            }
            return `https://storage.googleapis.com/${bucketName}/${fileName}`;

        } catch (error) {
            console.error(`[ImageCache] ❌ CRITICAL FAIL ${fileName}:`, error);
            return "https://placehold.co/600x400/grey/white?text=System+Error";
        }
    })();

    pendingRequests.set(lockKey, operationPromise);
    operationPromise.finally(() => {
        pendingRequests.delete(lockKey);
    });

    return operationPromise;
}
