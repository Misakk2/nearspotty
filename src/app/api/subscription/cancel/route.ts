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
 * Subscription Cancel API
 * 
 * Implements soft-cancel: sets cancel_at_period_end to true.
 * User retains Premium access until billing period ends.
 */
export async function POST(request: NextRequest) {
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
        console.error("[subscription/cancel] Token verification failed:", error);
        return NextResponse.json(
            { error: "Invalid or expired token", code: "INVALID_TOKEN" },
            { status: 401 }
        );
    }

    // --- 2. Get User's Stripe Customer ID ---
    try {
        const userDoc = await adminDb.collection("users").doc(userId).get();

        if (!userDoc.exists) {
            return NextResponse.json(
                { error: "User not found", code: "USER_NOT_FOUND" },
                { status: 404 }
            );
        }

        const userData = userDoc.data()!;

        if (!userData.stripeCustomerId) {
            return NextResponse.json(
                { error: "No subscription found", code: "NO_SUBSCRIPTION" },
                { status: 404 }
            );
        }

        // --- 3. Find Active Subscription ---
        const subscriptions = await stripe.subscriptions.list({
            customer: userData.stripeCustomerId,
            status: "active",
            limit: 1,
        });

        if (subscriptions.data.length === 0) {
            return NextResponse.json(
                { error: "No active subscription found", code: "NO_ACTIVE_SUBSCRIPTION" },
                { status: 404 }
            );
        }

        const subscription = subscriptions.data[0];

        // --- 4. Soft-Cancel: Set cancel_at_period_end ---
        const updatedSubscription = await stripe.subscriptions.update(subscription.id, {
            cancel_at_period_end: true,
        });

        // Type assertion for Stripe properties
        const subData = updatedSubscription as unknown as {
            cancel_at: number | null;
            current_period_end: number;
        };

        const cancelAt = subData.cancel_at
            ? toSafeISOString(subData.cancel_at)
            : null;
        const currentPeriodEnd = toSafeISOString(subData.current_period_end);

        // --- 5. Update Firestore ---
        await adminDb.collection("users").doc(userId).update({
            subscriptionStatus: "active_until_period_end",
            cancelAtPeriodEnd: true,
            cancelAt,
            currentPeriodEnd,
            updatedAt: new Date().toISOString(),
        });

        return NextResponse.json({
            success: true,
            message: "Subscription will be canceled at the end of the billing period",
            cancelAt,
            currentPeriodEnd,
            status: "active_until_period_end",
        });
    } catch (error) {
        console.error("[subscription/cancel] Error:", error);
        return NextResponse.json(
            { error: "Failed to cancel subscription" },
            { status: 500 }
        );
    }
}
