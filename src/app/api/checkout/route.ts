import { NextResponse } from "next/server";
import Stripe from "stripe";
import { PLAN_CONFIG, STRIPE_PRICES } from "@/lib/plan-limits";
import { getAdminDb } from "@/lib/firebase-admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-01-28.clover",
});

export async function POST(req: Request) {
    try {
        console.log('[Checkout] 🛒 Initializing checkout session');
        const secretKey = process.env.STRIPE_SECRET_KEY;
        const secretSuffix = secretKey && secretKey.length > 4 ? secretKey.substring(secretKey.length - 4) : '****';
        console.log(`[Checkout] 🔑 STRIPE_SECRET_KEY suffix: ...${secretSuffix}`);
        console.log(`[Checkout] 🔑 Key starts with: ${secretKey?.substring(0, 7)}...`);

        if (!secretKey) {
            throw new Error("STRIPE_SECRET_KEY is missing");
        }

        const { userId, userEmail, priceId, planName, successUrl, cancelUrl, trialDays } = await req.json();

        if (!userId || !priceId) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Use custom URLs if provided, otherwise fall back to defaults
        const origin = req.headers.get("origin") || "";
        const finalSuccessUrl = successUrl || `${origin}/profile?session_id={CHECKOUT_SESSION_ID}`;
        const finalCancelUrl = cancelUrl || `${origin}/subscription`;

        // Configure subscription data (trials)
        const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {};

        // Use provided trial day or default to global config
        let finalTrialDays = (typeof trialDays === 'number' && trialDays >= 0)
            ? trialDays
            : PLAN_CONFIG.TRIAL_DAYS;

        // Exception: No free trial for Diner Premium
        if (priceId === STRIPE_PRICES.diner_premium) {
            finalTrialDays = 0;
        }

        if (finalTrialDays > 0) {
            subscriptionData.trial_period_days = finalTrialDays;
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
            subscription_data: Object.keys(subscriptionData).length > 0 ? subscriptionData : undefined,
            success_url: finalSuccessUrl,
            cancel_url: finalCancelUrl,
            customer_email: userEmail,
            client_reference_id: userId,
            metadata: {
                userId: userId,
                plan: planName || 'premium',
                role: planName ? 'owner' : 'diner'
            },
        });



        // ✅ SAVE CUSTOMER ID TO FIREBASE
        const customerId = session.customer as string;

        if (customerId && userId) {
            await getAdminDb().collection("users").doc(userId).set({
                stripeCustomerId: customerId
            }, { merge: true });

            console.log(`[Checkout] Saved customerId ${customerId} for user ${userId}`);
        }

        return NextResponse.json({ url: session.url });
    } catch (error) {
        console.error("Stripe Checkout Error:", error);
        const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
