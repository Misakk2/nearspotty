import { getAdminDb } from "@/lib/firebase-admin";
import { DINER_LIMITS } from "@/lib/plan-limits";
import type { UserCredits } from "@/types";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface UserLimitStatus {
    tier: 'free' | 'premium';
    canSearch: boolean;
    remaining: number;
    used: number;
    limit: number;
    resetDate: string;
    limitReached: boolean;
}

/**
 * Check user's credit status and subscription tier.
 * Automatically resets credits if >30 days from last reset.
 */
export async function checkUserLimit(userId: string): Promise<UserLimitStatus> {
    const userRef = getAdminDb().collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
        // Auto-initialize free user
        const defaultCredits: UserCredits = {
            remaining: DINER_LIMITS.free.aiChecksPerMonth,
            used: 0,
            resetDate: new Date().toISOString(),
            limit: DINER_LIMITS.free.aiChecksPerMonth
        };

        await userRef.set({
            tier: 'free',
            credits: defaultCredits,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }, { merge: true });

        return {
            tier: 'free',
            canSearch: true,
            remaining: defaultCredits.remaining,
            used: 0,
            limit: defaultCredits.limit,
            resetDate: defaultCredits.resetDate,
            limitReached: false
        };
    }

    const userData = userDoc.data()!;
    const tier: 'free' | 'premium' = userData.tier || 'free';
    const credits = userData.credits || {
        remaining: tier === 'premium' ? -1 : DINER_LIMITS.free.aiChecksPerMonth,
        used: 0,
        resetDate: new Date().toISOString(),
        limit: tier === 'premium' ? -1 : DINER_LIMITS.free.aiChecksPerMonth
    };

    // NaN Guard: Ensure limit is always a valid number
    if (typeof credits.limit !== 'number' || isNaN(credits.limit)) {
        credits.limit = tier === 'premium' ? -1 : 5;
    }

    // Check if reset needed (30-day cycle)
    const now = Date.now();
    const resetTime = new Date(credits.resetDate).getTime();

    if (now - resetTime >= THIRTY_DAYS_MS) {
        // Reset credits for new period
        const newCredits: UserCredits = {
            remaining: tier === 'premium' ? -1 : DINER_LIMITS.free.aiChecksPerMonth,
            used: 0,
            resetDate: new Date().toISOString(),
            limit: tier === 'premium' ? -1 : DINER_LIMITS.free.aiChecksPerMonth
        };

        // Fire and forget update
        userRef.update({ credits: newCredits, updatedAt: new Date().toISOString() })
            .catch(err => console.error('Failed to reset credits:', err));

        return {
            tier,
            canSearch: true,
            remaining: newCredits.remaining,
            used: 0,
            limit: newCredits.limit,
            resetDate: newCredits.resetDate,
            limitReached: false
        };
    }

    // Premium: unlimited credits
    if (tier === 'premium') {
        return {
            tier: 'premium',
            canSearch: true,
            remaining: -1,
            used: credits.used || 0,
            limit: -1,
            resetDate: credits.resetDate,
            limitReached: false
        };
    }

    // Free: check limit
    const canSearch = credits.remaining > 0;

    return {
        tier: 'free',
        canSearch,
        remaining: credits.remaining,
        used: credits.used || 0,
        limit: credits.limit,
        resetDate: credits.resetDate,
        limitReached: !canSearch
    };
}

/**
 * Transactionally reserve a credit - atomically checks and decrements.
 * Returns authorization status and remaining credits.
 */
export async function reserveUserCredit(userId: string): Promise<{
    authorized: boolean;
    tier: 'free' | 'premium';
    remaining: number;
}> {
    const userRef = getAdminDb().collection('users').doc(userId);

    try {
        return await getAdminDb().runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);

            // Auto-initialize if user doesn't exist
            if (!userDoc.exists) {
                const defaultCredits: UserCredits = {
                    remaining: DINER_LIMITS.free.aiChecksPerMonth - 1, // Reserve 1 immediately
                    used: 1,
                    resetDate: new Date().toISOString(),
                    limit: DINER_LIMITS.free.aiChecksPerMonth
                };

                transaction.set(userRef, {
                    tier: 'free',
                    credits: defaultCredits,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                });

                return {
                    authorized: true,
                    tier: 'free',
                    remaining: defaultCredits.remaining
                };
            }

            const userData = userDoc.data()!;
            const tier: 'free' | 'premium' = userData.tier || 'free';
            let credits: UserCredits = userData.credits || {
                remaining: tier === 'premium' ? -1 : DINER_LIMITS.free.aiChecksPerMonth,
                used: 0,
                resetDate: new Date().toISOString(),
                limit: tier === 'premium' ? -1 : DINER_LIMITS.free.aiChecksPerMonth
            };

            // Check if reset needed
            const now = Date.now();
            const resetTime = new Date(credits.resetDate).getTime();

            if (now - resetTime >= THIRTY_DAYS_MS) {
                // Reset for new period
                credits = {
                    remaining: tier === 'premium' ? -1 : DINER_LIMITS.free.aiChecksPerMonth,
                    used: 0,
                    resetDate: new Date().toISOString(),
                    limit: tier === 'premium' ? -1 : DINER_LIMITS.free.aiChecksPerMonth
                };
            }

            // Premium: always authorized
            if (tier === 'premium') {
                transaction.update(userRef, {
                    'credits.used': (credits.used || 0) + 1,
                    updatedAt: new Date().toISOString()
                });

                return { authorized: true, tier: 'premium', remaining: -1 };
            }

            // Free: check if credits available
            if (credits.remaining > 0) {
                transaction.update(userRef, {
                    'credits.remaining': credits.remaining - 1,
                    'credits.used': (credits.used || 0) + 1,
                    updatedAt: new Date().toISOString()
                });

                return {
                    authorized: true,
                    tier: 'free',
                    remaining: credits.remaining - 1
                };
            }

            // Out of credits
            return { authorized: false, tier: 'free', remaining: 0 };
        });
    } catch (error) {
        console.error('Transaction failed:', error);
        return { authorized: false, tier: 'free', remaining: 0 };
    }
}

/**
 * Refund a credit to user (used when Gemini AI fails).
 * Only refunds for free tier users.
 */
export async function refundUserCredit(userId: string): Promise<{
    refunded: boolean;
    remaining: number;
}> {
    const userRef = getAdminDb().collection('users').doc(userId);

    try {
        return await getAdminDb().runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);

            if (!userDoc.exists) {
                return { refunded: false, remaining: 0 };
            }

            const userData = userDoc.data()!;
            const tier: 'free' | 'premium' = userData.tier || 'free';

            // Premium users don't need refunds
            if (tier === 'premium') {
                return { refunded: false, remaining: -1 };
            }

            const credits = userData.credits || {
                remaining: DINER_LIMITS.free.aiChecksPerMonth,
                used: 0,
                resetDate: new Date().toISOString(),
                limit: DINER_LIMITS.free.aiChecksPerMonth
            };

            // Refund 1 credit
            const newRemaining = credits.remaining + 1;
            const newUsed = Math.max(0, (credits.used || 0) - 1);

            transaction.update(userRef, {
                'credits.remaining': newRemaining,
                'credits.used': newUsed,
                updatedAt: new Date().toISOString()
            });

            console.log(`[UserLimits] Refunded credit for ${userId}. New remaining: ${newRemaining}`);

            return {
                refunded: true,
                remaining: newRemaining
            };
        });
    } catch (error) {
        console.error('Refund transaction failed:', error);
        return { refunded: false, remaining: 0 };
    }
}

