import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-01-27.acacia" as Stripe.StripeConfig["apiVersion"],
});

export async function POST(req: Request) {
    try {
        const { userId, userEmail, priceId, planName } = await req.json();

        if (!userId || !priceId) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: "subscription", // Business plans are recurring subscriptions
            success_url: `${req.headers.get("origin")}/profile?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.headers.get("origin")}/subscription`,
            customer_email: userEmail,
            client_reference_id: userId,
            metadata: {
                userId: userId,
                plan: planName || 'premium',
                role: planName ? 'owner' : 'diner'
            },
        });

        return NextResponse.json({ url: session.url });
    } catch (error) {
        console.error("Stripe Checkout Error:", error);
        const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
