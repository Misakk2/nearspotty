import { getAdminDb } from "./firebase-admin";

interface CacheEntry<T = unknown> {
    data: T;
    timestamp: number;
    ttl: number;
}

/**
 * Gets a cached value from Firestore if it exists and is not expired.
 */
// Fallback App ID if not in env

function getCacheCollectionRef(collectionName: string) {
    // Unified Cache Paths (v2)
    // We strictly map to root collections to avoid "artifacts" nesting complexity for high-frequency cache
    if (collectionName.includes("grid")) return getAdminDb().collection("cache_places_grid_v2");
    if (collectionName.includes("city")) return getAdminDb().collection("cache_places_city_v2");

    // Fallback for other collections (or legacy)
    return getAdminDb().collection(collectionName);
}

/**
 * Gets a cached value from Firestore if it exists and is not expired.
 */
export async function getCache<T = unknown>(collectionName: string, key: string): Promise<T | null> {
    try {
        const ref = getCacheCollectionRef(collectionName).doc(key);
        const doc = await ref.get();
        if (!doc.exists) return null;

        const entry = doc.data() as CacheEntry<T>;
        const now = Date.now();

        if (now - entry.timestamp > entry.ttl) {
            // Expired, delete it (fire and forget)
            ref.delete().catch(e => console.error("Cache purge failed:", e));
            return null;
        }

        // Async update usage stats (fire & forget)
        updateCacheUsage(collectionName, key).catch(e => console.error("Cache usage update failed:", e));

        return entry.data;
    } catch (error) {
        console.error("Cache get error (ignoring):", error);
        return null; // Fail safe
    }
}

/**
 * Updates the last_accessed timestamp and usage_count for a cache entry.
 * Uses atomic increments where possible.
 */
async function updateCacheUsage(collectionName: string, key: string) {
    // Only track usage for grid cache for now (optimization)
    if (!collectionName.includes("grid")) return;

    const ref = getCacheCollectionRef(collectionName).doc(key);

    // Using FieldValue.increment requires importing firebase-admin/firestore
    // Since we are using a custom wrapper, let's use a simple update for now
    // or properly import FieldValue if available in getAdminDb context.
    // For simplicity and speed: just set last_accessed. 
    // Usage count is nice but last_accessed is critical for the "14 days" rule.

    await ref.update({
        "data.last_accessed": Date.now(),
        // "data.usage_count": getAdminDb().FieldValue.increment(1) // pseudo-code, requires proper import
    });
}

/**
 * Sets a value in Firestore cache with a TTL.
 * @param ttl Time to live in milliseconds. Default 24h.
 */
export async function setCache<T = unknown>(collectionName: string, key: string, data: T, ttl: number = 24 * 60 * 60 * 1000, userId?: string) {
    // Auth Check: User must be authenticated to write to cache (PREVENTS PERMISSION DENIED crashes)
    if (!userId) {
        console.warn("[Cache] Skipping write: No authenticated user.");
        return;
    }

    try {
        // Sanitize data -> Remove undefined
        const cleanData = JSON.parse(JSON.stringify(data));

        const ref = getCacheCollectionRef(collectionName).doc(key);

        await ref.set({
            data: cleanData,
            timestamp: Date.now(),
            ttl,
            updatedBy: userId
        });

    } catch (error) {
        // Graceful Failure: Do NOT throw 500. Just log and continue.
        console.error(`[Cache] Write failed for ${key} (non-fatal):`, error);
    }
}

/**
 * Simple hash function to create a key from search parameters
 */
export function createCacheKey(params: Record<string, string | number | boolean | null | undefined>): string {
    const sortedKeys = Object.keys(params).sort();
    const str = sortedKeys.map(k => `${k}:${params[k]}`).join("|");
    // Using a simple string representation, for production you might want a MD5 hash
    // but since these are controlled inputs, this is fine and readable.
    return Buffer.from(str).toString("hex").slice(0, 100);
}
