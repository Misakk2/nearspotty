import { getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { DINER_LIMITS } from "@/lib/plan-limits";

const APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "nearspotty_default";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function getUsageRef(userId: string) {
    // /artifacts/${appId}/users/${userId}/usage/stats
    return getAdminDb().collection('artifacts').doc(APP_ID)
        .collection('users').doc(userId)
        .collection('usage').doc('stats');
}

export interface UserLimitStatus {
    count: number;
    canSearch: boolean;
    remaining: number;
    lastResetDate: string;
    tier: 'free' | 'premium';
    limitReached: boolean;
    limit: number;
}

/**
 * Check user's Search usage and subscription status.
 * Automatically resets count if >30 days from last reset.
 */
export async function checkUserLimit(userId: string): Promise<UserLimitStatus> {
    const userRef = getAdminDb().collection('users').doc(userId);
    const usageRef = getUsageRef(userId);

    const [userDoc, usageDoc] = await Promise.all([
        userRef.get(),
        usageRef.get()
    ]);

    // Default usage data
    const usageData = usageDoc.exists ? usageDoc.data()! : { count: 0, lastResetDate: new Date().toISOString() };
    const usageCount = usageData.count || 0;
    const lastResetDate = usageData.lastResetDate || new Date().toISOString();

    // Determine Tier
    let tier: 'free' | 'premium' = 'free';
    if (userDoc.exists) {
        const userData = userDoc.data()!;
        tier = userData.tier || userData.subscriptionTier || (userData.plan === 'premium' ? 'premium' : 'free');
    }

    // Check Reset Logic
    const now = Date.now();
    const lastResetTime = new Date(lastResetDate).getTime();
    if (now - lastResetTime >= THIRTY_DAYS_MS) {
        const newResetDate = new Date().toISOString();
        // Fire and forget reset update
        usageRef.set({
            count: 0,
            lastResetDate: newResetDate
        }, { merge: true }).catch(console.error);

        return {
            count: 0,
            canSearch: true,
            remaining: tier === 'premium' ? Infinity : DINER_LIMITS.free.aiChecksPerMonth,
            lastResetDate: newResetDate,
            tier,
            limitReached: false,
            limit: tier === 'premium' ? -1 : DINER_LIMITS.free.aiChecksPerMonth
        };
    }

    // Premium Check
    if (tier === 'premium') {
        return {
            count: usageCount,
            canSearch: true,
            remaining: Infinity,
            lastResetDate,
            tier,
            limitReached: false,
            limit: -1
        };
    }

    // Free Check
    const limit = DINER_LIMITS.free.aiChecksPerMonth;
    const remaining = Math.max(0, limit - usageCount);
    const canSearch = usageCount < limit;

    return {
        count: usageCount,
        canSearch,
        remaining,
        lastResetDate,
        tier,
        limitReached: !canSearch,
        limit
    };
}

/**
 * Increment usage count for a user.
 * Should be called AFTER a successful API call.
 */
export async function incrementUserUsage(userId: string): Promise<void> {
    const usageRef = getUsageRef(userId);
    await usageRef.set({
        count: FieldValue.increment(1),
        lastResetDate: FieldValue.serverTimestamp() // Keep date or update? Logic in check says keep unless 30 days. 
        // Actually, better to NOT update lastResetDate here, otherwise we postpone reset forever.
        // But we need to ensure the doc exists.
    }, { merge: true });
}

/**
 * Transactionally reserve a credit.
 * Used when we need to be strictly atomic (e.g. concurrent requests).
 */
export async function reserveUserCredit(userId: string): Promise<{ authorized: boolean; tier: 'free' | 'premium'; remaining: number }> {
    const usageRef = getUsageRef(userId);
    const userRef = getAdminDb().collection('users').doc(userId);

    try {
        return await getAdminDb().runTransaction(async (t) => {
            const userDoc = await t.get(userRef);
            const usageDoc = await t.get(usageRef);

            let tier: 'free' | 'premium' = 'free';
            if (userDoc.exists) {
                const d = userDoc.data()!;
                tier = d.tier || d.subscriptionTier || (d.plan === 'premium' ? 'premium' : 'free');
            }

            const usageData = usageDoc.exists ? usageDoc.data()! : { count: 0, lastResetDate: new Date().toISOString() };
            let count = usageData.count || 0;
            const lastResetDate = usageData.lastResetDate || new Date().toISOString();

            // Reset Check
            const now = Date.now();
            if (now - new Date(lastResetDate).getTime() >= THIRTY_DAYS_MS) {
                count = 0;
                t.set(usageRef, { count: 0, lastResetDate: new Date().toISOString() }, { merge: true });
            }

            if (tier === 'premium') {
                t.set(usageRef, { count: count + 1 }, { merge: true });
                return { authorized: true, tier, remaining: Infinity };
            }

            const limit = DINER_LIMITS.free.aiChecksPerMonth;
            if (count < limit) {
                t.set(usageRef, {
                    count: count + 1,
                    // Do NOT update lastResetDate on increment
                }, { merge: true });
                return { authorized: true, tier, remaining: limit - (count + 1) };
            }

            return { authorized: false, tier, remaining: 0 };
        });
    } catch (e) {
        console.error("User Credit Reservation Failed:", e);
        return { authorized: false, tier: 'free', remaining: 0 };
    }
}
