import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
    apiVersion: "2026-01-28.clover",
});

export async function POST(req: Request) {
    try {
        const { customerId, returnUrl } = await req.json();

        if (!customerId) {
            return NextResponse.json({ error: "Customer ID is required" }, { status: 400 });
        }

        // Create a portal session for the customer
        const portalSession = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: returnUrl || `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/dashboard`,
        });

        return NextResponse.json({ url: portalSession.url });
    } catch (error) {
        console.error("Portal session error:", error);
        const errorMessage = error instanceof Error ? error.message : "Failed to create portal session";
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
