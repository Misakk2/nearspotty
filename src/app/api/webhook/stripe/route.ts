import { NextResponse } from "next/server";
import Stripe from "stripe";
import { adminDb } from "@/lib/firebase-admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-01-28.clover",
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
                // Fetch subscription to get correct period end
                let currentPeriodEnd = new Date();
                let status: Stripe.Subscription.Status = "active";

                if (session.subscription) {
                    const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const subscription = await stripe.subscriptions.retrieve(subId) as any;
                    currentPeriodEnd = new Date(subscription.current_period_end * 1000);
                    status = subscription.status;
                } else {
                    // One-time payment fallback (add 30 days if needed, or lifetime)
                    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
                }

                await adminDb.collection("users").doc(userId).update({
                    role: role,
                    plan: plan,
                    tier: plan === 'premium' ? 'premium' : 'free',
                    subscription: {
                        status: status,
                        current_period_end: currentPeriodEnd.toISOString(),
                        cancel_at_period_end: false
                    },
                    stripeCustomerId: session.customer,
                    updatedAt: new Date().toISOString(),
                });
                console.log(`User ${userId} upgraded to ${plan} until ${currentPeriodEnd.toISOString()}`);
            } catch (firestoreError) {
                console.error("Firestore Update Error:", firestoreError);
                return NextResponse.json({ error: "Firestore Update Failed" }, { status: 500 });
            }
        }
    }

    // Handle subscription.updated - for plan changes, renewals, and soft-cancels
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

                // Handle soft-cancel: cancel_at_period_end means user canceled but retains access
                const cancelAtPeriodEnd = subscription.cancel_at_period_end;
                const cancelAt = subscription.cancel_at
                    ? new Date(subscription.cancel_at * 1000).toISOString()
                    : null;
                const currentPeriodEnd = new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000).toISOString();

                // User keeps premium access until period end even if they've canceled
                const effectiveTier = (isActive || cancelAtPeriodEnd) ? 'premium' : 'free';

                await userDoc.ref.update({
                    tier: effectiveTier,
                    subscription: {
                        status: status,
                        current_period_end: currentPeriodEnd,
                        cancel_at_period_end: cancelAtPeriodEnd,
                        cancel_at: cancelAt
                    },
                    updatedAt: new Date().toISOString(),
                });
                console.log(`User ${userDoc.id} subscription updated: ${status}, tier: ${effectiveTier}`);
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
                    tier: "free",
                    plan: "free",
                    subscription: {
                        status: "canceled",
                        current_period_end: new Date().toISOString(),
                        cancel_at_period_end: false
                    },
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

