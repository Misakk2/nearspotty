import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-01-28.clover",
});

function toSafeISOString(timestamp: number | null | undefined): string {
    if (!timestamp) return new Date().toISOString();
    const date = new Date(timestamp * 1000);
    return !isNaN(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

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

        // --- 3. Fetch Real-time Stripe Data if Customer Exists ---
        let stripeSubscription = null;
        if (userData.stripeCustomerId) {
            try {
                const subscriptions = await stripe.subscriptions.list({
                    customer: userData.stripeCustomerId,
                    status: "all",
                    limit: 1,
                });

                if (subscriptions.data.length > 0) {
                    const sub = subscriptions.data[0];
                    // Type assertion for Stripe properties
                    const subData = sub as unknown as {
                        id: string;
                        status: string;
                        cancel_at_period_end: boolean;
                        cancel_at: number | null;
                        current_period_end: number;
                        current_period_start: number;
                    };
                    stripeSubscription = {
                        id: subData.id,
                        status: subData.status,
                        cancelAtPeriodEnd: subData.cancel_at_period_end,
                        cancelAt: subData.cancel_at ? new Date(subData.cancel_at * 1000).toISOString() : null,
                        currentPeriodEnd: toSafeISOString(subData.current_period_end),
                        currentPeriodStart: toSafeISOString(subData.current_period_start),
                    };
                }
            } catch (stripeError) {
                console.error("[subscription/status] Stripe fetch error:", stripeError);
                // Continue with Firestore data only
            }
        }

        // --- 4. Determine Display Status ---
        // Prioritize nested subscription object, fall back to legacy fields
        let subscriptionStatus = userData.subscription?.status || userData.subscriptionStatus || "none";
        let cancelAtPeriodEnd = userData.subscription?.cancel_at_period_end ?? userData.cancelAtPeriodEnd ?? false;
        let currentPeriodEnd = userData.subscription?.current_period_end || userData.currentPeriodEnd;
        let cancelAt = userData.subscription?.cancel_at || userData.cancelAt;

        // Sync with fresh Stripe data if available (truth source)
        if (stripeSubscription) {
            if (stripeSubscription.id) {
                // Logic to prioritize stripe regarding status?
                // Generally we trust Firestore if webhook is working, but for status check API, checking Stripe directly is safer.
                subscriptionStatus = stripeSubscription.status;
                cancelAtPeriodEnd = stripeSubscription.cancelAtPeriodEnd;
                currentPeriodEnd = stripeSubscription.currentPeriodEnd;
                cancelAt = stripeSubscription.cancelAt;
            }
        }

        let displayStatus = subscriptionStatus;
        if (cancelAtPeriodEnd && subscriptionStatus === "active") {
            displayStatus = "active_until_period_end";
        }

        return NextResponse.json({
            tier,
            status: displayStatus,
            stripeSubscription,
            currentPeriodEnd: currentPeriodEnd || stripeSubscription?.currentPeriodEnd,
            cancelAtPeriodEnd: cancelAtPeriodEnd || stripeSubscription?.cancelAtPeriodEnd || false,
            cancelAt: cancelAt || stripeSubscription?.cancelAt,
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
