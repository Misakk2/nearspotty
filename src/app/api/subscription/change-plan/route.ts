import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAdminDb } from "@/lib/firebase-admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-01-28.clover",
});

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { newPriceId, userId } = await request.json();

        if (!newPriceId || !userId) {
            return NextResponse.json(
                { error: "Missing newPriceId or userId" },
                { status: 400 }
            );
        }

        const db = getAdminDb();
        const userDoc = await db.collection("users").doc(userId).get();

        if (!userDoc.exists) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const userData = userDoc.data();
        const subscription = userData?.subscription;

        if (!subscription?.subscriptionId) {
            return NextResponse.json(
                { error: "No active subscription found" },
                { status: 400 }
            );
        }

        const subscriptionId = subscription.subscriptionId;

        // Retrieve current subscription from Stripe
        const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);

        if (!stripeSubscription.items.data[0]) {
            return NextResponse.json(
                { error: "No subscription items found" },
                { status: 400 }
            );
        }

        const currentItemId = stripeSubscription.items.data[0].id;

        // Update subscription with new price
        // Stripe will automatically handle proration (credit or charge difference)
        const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
            items: [
                {
                    id: currentItemId,
                    price: newPriceId,
                },
            ],
            proration_behavior: "create_prorations", // Enables automatic proration
        });

        // Determine new tier from price ID
        const priceToTier: Record<string, string> = {
            'price_1SuvxKEOZfDm5I749j79vou5': 'premium',       // Diner Premium
            'price_1SuvxLEOZfDm5I74RvCbvgkg': 'basic',         // Business Basic
            'price_1SuvxLEOZfDm5I74QLxVBQKw': 'pro',           // Business Pro
            'price_1SuvxMEOZfDm5I74I28E8OtJ': 'enterprise',   // Business Enterprise
        };

        const newTier = priceToTier[newPriceId] || 'free';

        // Update Firestore immediately for better UX
        // Webhook will also update this, but being proactive prevents delays
        await db.collection("users").doc(userId).update({
            "subscription.tier": newTier,
            "subscription.priceId": newPriceId,
            "subscription.status": updatedSubscription.status,
            tier: newTier, // Legacy field for compatibility
        });

        return NextResponse.json({
            success: true,
            message: `Plan changed to ${newTier}`,
            subscription: {
                id: updatedSubscription.id,
                status: updatedSubscription.status,
            },
        });
    } catch (error) {
        console.error("Change Plan Error:", error);
        
        if (error instanceof Stripe.errors.StripeError) {
            return NextResponse.json(
                { error: error.message },
                { status: error.statusCode || 500 }
            );
        }

        return NextResponse.json(
            { error: "Failed to change plan" },
            { status: 500 }
        );
    }
}
