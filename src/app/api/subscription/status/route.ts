import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
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
        const decodedToken = await getAdminAuth().verifyIdToken(token);
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
        const userDoc = await getAdminDb().collection("users").doc(userId).get();

        if (!userDoc.exists) {
            return NextResponse.json({
                tier: "free",
                status: "none",
                usage: { count: 0, remaining: 5, limit: 5 },
            });
        }

        const userData = userDoc.data()!;
        const tier: 'free' | 'premium' = userData.tier || 'free';
        const credits = userData.credits || {
            remaining: tier === 'premium' ? -1 : 5,
            used: 0,
            limit: tier === 'premium' ? -1 : 5,
            resetDate: new Date().toISOString()
        };

        // --- 3. Determine Display Status (Firestore Only) ---
        // We rely on Webhooks to keep Firestore in sync.
        // This removes the latency of fetching from Stripe on every request.

        // Prioritize new subscription object structure
        const subscriptionStatus = userData.subscription?.status || "none";
        const cancelAtPeriodEnd = userData.subscription?.cancelAtPeriodEnd ?? false;
        const currentPeriodEnd = userData.subscription?.currentPeriodEnd;
        const cancelAt = userData.subscription?.cancelAt;

        let displayStatus = subscriptionStatus;
        if (cancelAtPeriodEnd && subscriptionStatus === "active") {
            displayStatus = "active_until_period_end";
        }

        return NextResponse.json({
            tier,
            status: displayStatus,
            stripeSubscription: null,
            currentPeriodEnd: currentPeriodEnd,
            cancelAtPeriodEnd: cancelAtPeriodEnd,
            cancelAt: cancelAt,
            credits: {
                remaining: credits.remaining,
                used: credits.used,
                limit: credits.limit === -1 ? "unlimited" : credits.limit,
                resetDate: credits.resetDate
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
