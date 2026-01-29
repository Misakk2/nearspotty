import { adminDb } from "./firebase-admin";

interface CacheEntry<T = unknown> {
    data: T;
    timestamp: number;
    ttl: number;
}

/**
 * Gets a cached value from Firestore if it exists and is not expired.
 */
export async function getCache<T = unknown>(collection: string, key: string): Promise<T | null> {
    try {
        const doc = await adminDb.collection(collection).doc(key).get();
        if (!doc.exists) return null;

        const entry = doc.data() as CacheEntry<T>;
        const now = Date.now();

        if (now - entry.timestamp > entry.ttl) {
            // Expired, delete it (fire and forget)
            adminDb.collection(collection).doc(key).delete().catch(console.error);
            return null;
        }

        return entry.data;
    } catch (error) {
        console.error("Cache get error:", error);
        return null;
    }
}

/**
 * Sets a value in Firestore cache with a TTL.
 * @param ttl Time to live in milliseconds. Default 24h.
 */
export async function setCache<T = unknown>(collection: string, key: string, data: T, ttl: number = 24 * 60 * 60 * 1000) {
    try {
        await adminDb.collection(collection).doc(key).set({
            data,
            timestamp: Date.now(),
            ttl
        });
    } catch (error) {
        console.error("Cache set error:", error);
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
