import { adminDb } from "./firebase-admin";

interface RateLimitConfig {
    limit: number;      // Max requests
    windowMs: number;   // Window in milliseconds
}

/**
 * Checks if a request should be rate limited.
 * @param identifier Unique ID (IP address, User ID)
 * @param config Rate limit config
 * @returns { limitReached: boolean, remaining: number, reset: number }
 */
export async function checkRateLimit(identifier: string, config: RateLimitConfig) {
    const now = Date.now();
    const docRef = adminDb.collection("rate_limits").doc(identifier);

    try {
        const result = await adminDb.runTransaction(async (transaction) => {
            const doc = await transaction.get(docRef);

            if (!doc.exists) {
                const newEntry = {
                    count: 1,
                    resetTime: now + config.windowMs
                };
                transaction.set(docRef, newEntry);
                return { limitReached: false, remaining: config.limit - 1, reset: newEntry.resetTime };
            }

            const data = doc.data() as { count: number; resetTime: number };

            if (now > data.resetTime) {
                // Window expired, reset
                const newEntry = {
                    count: 1,
                    resetTime: now + config.windowMs
                };
                transaction.set(docRef, newEntry);
                return { limitReached: false, remaining: config.limit - 1, reset: newEntry.resetTime };
            }

            if (data.count >= config.limit) {
                return { limitReached: true, remaining: 0, reset: data.resetTime };
            }

            // Increment count
            const updatedCount = data.count + 1;
            transaction.update(docRef, { count: updatedCount });
            return { limitReached: false, remaining: config.limit - updatedCount, reset: data.resetTime };
        });

        return result;
    } catch (error) {
        console.error("Rate limit check error:", error);
        // Fail open if database issue, or closed? Usually open for UX, but closed for security.
        return { limitReached: false, remaining: 1, reset: now + config.windowMs };
    }
}
