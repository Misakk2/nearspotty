import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
    apiVersion: "2026-01-28.clover",
});

export async function POST(req: Request) {
    try {
        // 1. Authenticate user
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const token = authHeader.split("Bearer ")[1];
        const decodedToken = await import("@/lib/firebase-admin").then(m => m.getAdminAuth().verifyIdToken(token));
        const userId = decodedToken.uid;

        // 2. Get User from Firestore
        const { getAdminDb } = await import("@/lib/firebase-admin");
        const userDoc = await getAdminDb().collection("users").doc(userId).get();
        const userData = userDoc.data();

        if (!userData?.stripeCustomerId) {
            return NextResponse.json({ error: "No subscription found" }, { status: 404 });
        }

        const { returnUrl } = await req.json().catch(() => ({}));

        // 3. Create Portal Session
        const portalSession = await stripe.billingPortal.sessions.create({
            customer: userData.stripeCustomerId,
            return_url: returnUrl || `${process.env.NEXT_PUBLIC_BASE_URL || req.headers.get("origin") || "http://localhost:3000"}/profile`,
        });

        return NextResponse.json({ url: portalSession.url });
    } catch (error) {
        console.error("Portal session error:", error);
        const errorMessage = error instanceof Error ? error.message : "Failed to create portal session";
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
