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

    // Handle the event
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

    return NextResponse.json({ received: true });
}
