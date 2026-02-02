import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
/**
 * Subscription Status API
 * 
 * Returns real-time subscription data from Stripe synced with Firestore.
 * Includes: status, tier, cancelAtPeriodEnd, currentPeriodEnd, usage stats
 */
export async function GET(request: NextRequest) {
    // --- 1. Authenticate User ---
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return NextResponse.json(
            { error: "Authentication required", code: "UNAUTHORIZED" },
            { status: 401 }
        );
    }

    const token = authHeader.split("Bearer ")[1];
    let userId: string;

    try {
        const decodedToken = await adminAuth.verifyIdToken(token);
        userId = decodedToken.uid;
    } catch (error) {
        console.error("[subscription/status] Token verification failed:", error);
        return NextResponse.json(
            { error: "Invalid or expired token", code: "INVALID_TOKEN" },
            { status: 401 }
        );
    }

    // --- 2. Fetch User Data from Firestore ---
    try {
        const userDoc = await adminDb.collection("users").doc(userId).get();

        if (!userDoc.exists) {
            return NextResponse.json({
                tier: "free",
                status: "none",
                usage: { count: 0, remaining: 5, limit: 5 },
            });
        }

        const userData = userDoc.data()!;
        const tier = userData.tier || userData.subscriptionTier || (userData.plan === 'premium' ? 'premium' : 'free');
        const usage = userData.usage || userData.aiUsage || { count: 0 };
        const limit = tier === "premium" ? Infinity : 5;
        const remaining = tier === "premium" ? Infinity : Math.max(0, 5 - usage.count);

        // --- 3. Determine Display Status (Firestore Only) ---
        // We rely on Webhooks to keep Firestore in sync.
        // This removes the latency of fetching from Stripe on every request.

        // Prioritize nested subscription object, fall back to legacy fields
        const subscriptionStatus = userData.subscription?.status || userData.subscriptionStatus || "none";
        const cancelAtPeriodEnd = userData.subscription?.cancel_at_period_end ?? userData.cancelAtPeriodEnd ?? false;
        const currentPeriodEnd = userData.subscription?.current_period_end || userData.currentPeriodEnd;
        const cancelAt = userData.subscription?.cancel_at || userData.cancelAt;

        let displayStatus = subscriptionStatus;
        if (cancelAtPeriodEnd && subscriptionStatus === "active") {
            displayStatus = "active_until_period_end";
        }

        return NextResponse.json({
            tier,
            status: displayStatus,
            stripeSubscription: null, // Removed for performance
            currentPeriodEnd: currentPeriodEnd,
            cancelAtPeriodEnd: cancelAtPeriodEnd,
            cancelAt: cancelAt,
            usage: {
                count: usage.count,
                remaining,
                limit: limit === Infinity ? "unlimited" : limit,
                lastResetDate: usage.lastResetDate,
            },
            email: userData.email,
            displayName: userData.displayName || userData.name,
        });
    } catch (error) {
        console.error("[subscription/status] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch subscription status" },
            { status: 500 }
        );
    }
}
