import { getAdminDb } from "./firebase-admin";

interface CacheEntry<T = unknown> {
    data: T;
    timestamp: number;
    ttl: number;
}

// In-memory cache usage tracking (reset on server restart)
// Replaces Firestore writes on every cache read
const cacheHitMetrics = new Map<string, { hits: number; lastAccessed: number }>();

/**
 * Records a cache hit in memory for analytics.
 * Much cheaper than Firestore writes on every read.
 */
function trackCacheHit(collectionName: string, key: string) {
    const metricKey = `${collectionName}:${key}`;
    const existing = cacheHitMetrics.get(metricKey);

    if (existing) {
        existing.hits++;
        existing.lastAccessed = Date.now();
    } else {
        cacheHitMetrics.set(metricKey, { hits: 1, lastAccessed: Date.now() });
    }
}

/**
 * Gets cache metrics for monitoring and debugging.
 * Used by /api/debug/cache-stats endpoint.
 */
export function getCacheMetrics() {
    const metrics: Record<string, { hits: number; lastAccessed: number }> = {};
    cacheHitMetrics.forEach((value, key) => {
        metrics[key] = value;
    });
    return metrics;
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

        // Track cache hit in memory (no Firestore write)
        trackCacheHit(collectionName, key);

        return entry.data;
    } catch (error) {
        console.error("Cache get error (ignoring):", error);
        return null; // Fail safe
    }
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
