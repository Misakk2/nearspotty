/**
 * AI Usage helper for subscription-based limits.
 * 
 * Free users: 5 AI checks per month
 * Premium users: Unlimited
 * 
 * Usage resets monthly (30 days from lastResetDate).
 */

import { adminDb } from "@/lib/firebase-admin";
import { DINER_LIMITS } from "@/lib/plan-limits";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface AIUsageStatus {
    count: number;
    canUse: boolean;
    remaining: number;
    lastResetDate: string;
    tier: 'free' | 'premium';
    limitReached: boolean;
}

/**
 * Check user's AI usage and subscription status.
 * Automatically resets count if >30 days since last reset.
 */
export async function checkAIUsage(userId: string): Promise<AIUsageStatus> {
    const userRef = adminDb.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
        // New user - initialize with free tier
        return {
            count: 0,
            canUse: true,
            remaining: DINER_LIMITS.free.aiChecksPerMonth,
            lastResetDate: new Date().toISOString(),
            tier: 'free',
            limitReached: false
        };
    }

    const userData = userDoc.data()!;
    const tier: 'free' | 'premium' = userData.subscriptionTier || userData.plan === 'premium' ? 'premium' : 'free';
    const aiUsage = userData.aiUsage || { count: 0, lastResetDate: new Date().toISOString() };

    const now = Date.now();
    const lastReset = new Date(aiUsage.lastResetDate).getTime();

    // Check if we need to reset (>30 days)
    if (now - lastReset >= THIRTY_DAYS_MS) {
        const newResetDate = new Date().toISOString();
        await userRef.update({
            'aiUsage.count': 0,
            'aiUsage.lastResetDate': newResetDate
        });

        return {
            count: 0,
            canUse: true,
            remaining: tier === 'premium' ? Infinity : DINER_LIMITS.free.aiChecksPerMonth,
            lastResetDate: newResetDate,
            tier,
            limitReached: false
        };
    }

    // Premium users have unlimited
    if (tier === 'premium') {
        return {
            count: aiUsage.count,
            canUse: true,
            remaining: Infinity,
            lastResetDate: aiUsage.lastResetDate,
            tier,
            limitReached: false
        };
    }

    // Free user - check limit
    const limit = DINER_LIMITS.free.aiChecksPerMonth;
    const remaining = Math.max(0, limit - aiUsage.count);
    const canUse = aiUsage.count < limit;

    return {
        count: aiUsage.count,
        canUse,
        remaining,
        lastResetDate: aiUsage.lastResetDate,
        tier,
        limitReached: !canUse
    };
}

/**
 * Increment AI usage count for a user.
 * Should be called after successful AI scoring.
 */
export async function incrementAIUsage(userId: string): Promise<void> {
    const userRef = adminDb.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
        // Initialize for new user
        await userRef.set({
            aiUsage: {
                count: 1,
                lastResetDate: new Date().toISOString()
            }
        }, { merge: true });
        return;
    }

    const userData = userDoc.data()!;
    const currentCount = userData.aiUsage?.count || 0;

    await userRef.update({
        'aiUsage.count': currentCount + 1,
        'aiUsage.lastResetDate': userData.aiUsage?.lastResetDate || new Date().toISOString()
    });
}

/**
 * Get user's subscription tier.
 * Checks subscription status and expiry for accurate tier.
 */
export async function getUserTier(userId: string): Promise<'free' | 'premium'> {
    const userDoc = await adminDb.collection('users').doc(userId).get();

    if (!userDoc.exists) return 'free';

    const data = userDoc.data()!;

    // If explicitly set as premium and subscription is active
    if (data.subscriptionTier === 'premium' || data.plan === 'premium') {
        // Check if subscription hasn't expired
        if (data.currentPeriodEnd) {
            const endDate = new Date(data.currentPeriodEnd).getTime();
            if (Date.now() > endDate) {
                // Subscription expired - downgrade to free
                await adminDb.collection('users').doc(userId).update({
                    subscriptionTier: 'free',
                    subscriptionStatus: 'expired'
                });
                return 'free';
            }
        }
        return 'premium';
    }

    return 'free';
}
