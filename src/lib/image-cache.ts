import { getAdminStorage } from "@/lib/firebase-admin";
import crypto from 'crypto';

const CACHE_BUCKET_NAME = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "place-photos-cache";
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

    // Detect Emulator status from Environment
    const isEmulator =
        process.env.NODE_ENV === "development" &&
        (!!process.env.FIREBASE_STORAGE_EMULATOR_HOST || process.env.NEXT_PUBLIC_USE_EMULATORS === "true");

    const operationPromise = (async (): Promise<string> => {
        try {
            // Use the SHARED adminStorage instance which is already configured for Emulator or Prod
            const bucket = getAdminStorage().bucket(CACHE_BUCKET_NAME);
            const file = bucket.file(fileName);

            // Emulator Setup (Safe idempotency check)
            if (isEmulator) {
                const [bucketExists] = await bucket.exists();
                if (!bucketExists) {
                    await bucket.create();
                }
            }

            // Check Cache
            const [exists] = await file.exists();
            if (exists) {
                if (isEmulator) {
                    // Emulator URL: http://<host>:<port>/<projectId>/<bucket>/<path>
                    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'nearspotty-dev';
                    // We assume standard port 9199 for storage emulator if not set
                    const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST || "127.0.0.1:9199";
                    return `http://${storageHost}/${projectId}/${CACHE_BUCKET_NAME}/${fileName}`;
                }
                return `https://storage.googleapis.com/${CACHE_BUCKET_NAME}/${fileName}`;
            }

            console.log(`[ImageCache] ☁️ MISS: ${fileName}. Downloading from Google V1...`);

            // --- V1 MEDIA DOWNLOAD LOGIC ---
            // Construct Resource Name if missing
            const resourceName = photoReference;
            if (!resourceName.startsWith("places/")) {
                console.warn(`[ImageCache] ⚠️ Legacy photo reference detected: ${photoReference}. Use V1.`);
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
            console.log(`[ImageCache] 💾 SAVING to Bucket: ${CACHE_BUCKET_NAME} File: ${fileName}`);

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
                resumable: false,
                validation: false
            });

            console.log(`[ImageCache] ✅ SAVE SUCCESS: ${fileName}`);

            // Make file public (Standard GCP/Firebase Storage)
            // With ADC, the principal must have Storage Object Admin or similar.
            try {
                if (!isEmulator) {
                    await file.makePublic();
                    console.log(`[ImageCache] 🌍 Made Public: ${fileName}`);
                }
            } catch (pubErr) {
                console.warn(`[ImageCache] ⚠️ MakePublic Failed (Non-Fatal):`, pubErr);
            }

            if (isEmulator) {
                // const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'nearspotty-dev'; // UNUSED
                const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST || "127.0.0.1:9199";
                return `http://${storageHost}/v0/b/${CACHE_BUCKET_NAME}/o/${encodeURIComponent(fileName)}?alt=media`;
            }
            // Use public URL for GCS
            return `https://storage.googleapis.com/${CACHE_BUCKET_NAME}/${fileName}`;

        } catch (error) {
            console.error(`[ImageCache] ❌ CRITICAL FAIL ${fileName}:`, error);
            // Return placeholder on failure to not break UI
            return "https://placehold.co/600x400/grey/white?text=System+Error";
        }
    })();

    pendingRequests.set(lockKey, operationPromise);
    operationPromise.finally(() => {
        pendingRequests.delete(lockKey);
    });

    return operationPromise;
}
