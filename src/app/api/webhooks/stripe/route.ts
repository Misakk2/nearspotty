import { NextResponse } from "next/server";
import Stripe from "stripe";
import { adminDb } from "@/lib/firebase-admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-01-28.clover",
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(request: Request) {
    // 1. Validate Secret & Signature
    const signature = request.headers.get("stripe-signature");
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

    if (!signature || !webhookSecret) {
        console.error("❌ [Stripe Webhook] Missing signature or secret");
        return NextResponse.json({ error: "Missing signature or secret" }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
        const body = await request.text();
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
        console.log(`[Stripe Webhook] 🔔 Webhook Verified. Event: ${event.type}`);
    } catch (err: any) {
        console.error(`❌ [Stripe Webhook] Signature Verification Failed: ${err.message}`);
        return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
    }

    console.log(`[Stripe Webhook] ➡️  Event Type: ${event.type}`);

    // Handle checkout.session.completed - immediate upgrade
    if (event.type === "checkout.session.completed") {
        try {
            const session = event.data.object as Stripe.Checkout.Session;
            const userId = session.client_reference_id;

            console.log(`[Stripe Webhook] Processing checkout.session.completed for Session ID: ${session.id}`);
            console.log(`[Stripe Webhook] Client Reference ID (User ID): ${userId}`);

            if (userId) {
                const role = session.metadata?.role || "premium";
                const plan = session.metadata?.plan || "premium";

                console.log(`[Stripe Webhook] Fulfilling order for user: ${userId} as ${role} (${plan})`);

                // Fetch subscription to get correct period end
                let currentPeriodEnd = new Date();
                let status: Stripe.Subscription.Status = "active";
                let cancelAtPeriodEnd = false;
                let cancelAt: string | null = null;
                let subscriptionId = '';

                if (session.subscription) {
                    subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const subscription = await stripe.subscriptions.retrieve(subscriptionId) as any;

                    // Safe Date Parsing
                    if (subscription.current_period_end) {
                        const parsedDate = new Date(subscription.current_period_end * 1000);
                        if (!isNaN(parsedDate.getTime())) {
                            currentPeriodEnd = parsedDate;
                        } else {
                            console.warn("⚠️ [Stripe Webhook] Invalid current_period_end received, using fallback.");
                            currentPeriodEnd = new Date();
                            currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
                        }
                    } else {
                        // Fallback to now + 30 days if somehow missing
                        currentPeriodEnd = new Date();
                        currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
                    }

                    status = subscription.status;
                    cancelAtPeriodEnd = subscription.cancel_at_period_end;

                    console.log(`[Stripe Webhook] 📋 Subscription Details found: ID=${subscriptionId}, Status=${status}, CancelAtPeriodEnd=${cancelAtPeriodEnd}`);

                    if (subscription.cancel_at) {
                        cancelAt = new Date(subscription.cancel_at * 1000).toISOString();
                    }
                    console.log(`[Stripe Webhook] Retrieved Subscription: ${subscriptionId}, Status: ${status}`);
                } else {
                    // One-time payment fallback (add 30 days if needed, or lifetime)
                    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
                    console.log(`[Stripe Webhook] One-time payment, setting period end to +1 month`);
                }

                console.log(`[Stripe Webhook] 🔄 Attempting Firestore Update for User ${userId}...`);
                console.log(`[Stripe Webhook] Data Payload (Plan: ${plan}, Tier: premium, Status: ${status})`);

                // Standardized User Object Update
                // Update user with subscription details AND explicit tier upgrade
                await adminDb.collection("users").doc(userId).set({
                    subscription: {
                        status: status,
                        tier: 'premium',
                        plan: plan,
                        id: subscriptionId,
                        current_period_end: currentPeriodEnd.toISOString(),
                        cancel_at_period_end: cancelAtPeriodEnd,
                        cancel_at: cancelAt,
                        updatedAt: new Date().toISOString()
                    },
                    // Flattened critical fields
                    tier: 'premium',
                    stripeCustomerId: session.customer,
                    updatedAt: new Date().toISOString(),
                }, { merge: true });

                console.log(`✅ [Stripe Webhook] SUCCESS: User ${userId} updated in Firestore.`);
                console.log(`[Stripe Webhook] User ${userId} upgraded to ${plan} until ${currentPeriodEnd.toISOString()}`);
            } else {
                console.error("❌ [Stripe Webhook] ERROR: checkout.session.completed missing client_reference_id. Cannot link to user.");
            }
        } catch (err: any) {
            console.error("❌ [Stripe Webhook] CRITICAL ERROR in checkout.session.completed handler:");
            console.error(err);
            return NextResponse.json({ error: "Webhook Handler Failed", details: err.message }, { status: 500 });
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

                // User keeps premium access until period end even if they've canceled, unless status is not active/trialing (e.g. unpaid)
                // If status is 'past_due', we might still want to show them as premium for a grace period, but standard logic is usually strictly based on active status.
                // However, the requirement says "Updated data structure... subscription.status = 'active'".
                // We will rely on effectiveTier logic.

                const effectiveTier = (isActive) ? 'premium' : 'free';

                await userDoc.ref.set({
                    subscription: {
                        status: status,
                        tier: effectiveTier,
                        id: subscription.id,
                        current_period_end: currentPeriodEnd,
                        cancel_at_period_end: cancelAtPeriodEnd,
                        cancel_at: cancelAt,
                        updatedAt: new Date().toISOString()
                    },
                    tier: effectiveTier,
                    updatedAt: new Date().toISOString(),
                }, { merge: true });

                console.log(`[Stripe Webhook] User ${userDoc.id} subscription updated: ${status}, tier: ${effectiveTier}`);
            } else {
                console.warn(`[Stripe Webhook] No user found for customer: ${customerId} (updated)`);
            }
        } catch (error) {
            console.error("[Stripe Webhook] Subscription update error:", error);
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

                await userDoc.ref.set({
                    subscription: {
                        status: "canceled",
                        tier: "free",
                        current_period_end: new Date().toISOString(), // Expired
                        cancel_at_period_end: false,
                        updatedAt: new Date().toISOString()
                    },
                    tier: "free",
                    plan: "free",
                    updatedAt: new Date().toISOString(),
                }, { merge: true });

                console.log(`[Stripe Webhook] User ${userDoc.id} downgraded to free (deleted)`);
            } else {
                console.warn(`[Stripe Webhook] No user found for customer: ${customerId} (deleted)`);
            }
        } catch (error) {
            console.error("[Stripe Webhook] Subscription deletion error:", error);
        }
    }

    return NextResponse.json({ received: true });
}

