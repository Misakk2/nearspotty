import { NextResponse } from "next/server";
import Stripe from "stripe";
import { adminDb } from "@/lib/firebase-admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-01-27.acacia" as Stripe.StripeConfig["apiVersion"],
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(req: Request) {
    const body = await req.text();
    const sig = req.headers.get("stripe-signature");

    let event: Stripe.Event;

    try {
        if (!sig || !webhookSecret) {
            console.error("Missing signature or webhook secret");
            return NextResponse.json({ error: "Webhook Error" }, { status: 400 });
        }
        event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        console.error(`Webhook Error: ${errorMessage}`);
        return NextResponse.json({ error: `Webhook Error: ${errorMessage}` }, { status: 400 });
    }

    // Handle checkout.session.completed - immediate upgrade
    if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;

        if (userId) {
            const role = session.metadata?.role || "premium";
            const plan = session.metadata?.plan || "premium";

            console.log(`Fulfilling order for user: ${userId} as ${role} (${plan})`);

            try {
                await adminDb.collection("users").doc(userId).update({
                    role: role,
                    plan: plan,
                    subscriptionTier: plan === 'premium' ? 'premium' : 'free',
                    subscriptionStatus: "active",
                    stripeCustomerId: session.customer,
                    updatedAt: new Date().toISOString(),
                });
                console.log(`User ${userId} upgraded to ${plan}`);
            } catch (firestoreError) {
                console.error("Firestore Update Error:", firestoreError);
                return NextResponse.json({ error: "Firestore Update Failed" }, { status: 500 });
            }
        }
    }

    // Handle subscription.updated - for plan changes and renewals
    if (event.type === "customer.subscription.updated") {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        try {
            // Find user by stripeCustomerId
            const usersSnapshot = await adminDb.collection("users")
                .where("stripeCustomerId", "==", customerId)
                .limit(1)
                .get();

            if (!usersSnapshot.empty) {
                const userDoc = usersSnapshot.docs[0];
                const status = subscription.status;
                const isActive = status === 'active' || status === 'trialing';

                await userDoc.ref.update({
                    subscriptionStatus: status,
                    subscriptionTier: isActive ? 'premium' : 'free',
                    currentPeriodEnd: new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000).toISOString(),
                    updatedAt: new Date().toISOString(),
                });
                console.log(`User ${userDoc.id} subscription updated: ${status}`);
            }
        } catch (error) {
            console.error("Subscription update error:", error);
        }
    }

    // Handle subscription.deleted - downgrade to free
    if (event.type === "customer.subscription.deleted") {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        try {
            const usersSnapshot = await adminDb.collection("users")
                .where("stripeCustomerId", "==", customerId)
                .limit(1)
                .get();

            if (!usersSnapshot.empty) {
                const userDoc = usersSnapshot.docs[0];

                await userDoc.ref.update({
                    subscriptionStatus: "canceled",
                    subscriptionTier: "free",
                    plan: "free",
                    updatedAt: new Date().toISOString(),
                });
                console.log(`User ${userDoc.id} downgraded to free`);
            }
        } catch (error) {
            console.error("Subscription deletion error:", error);
        }
    }

    return NextResponse.json({ received: true });
}

