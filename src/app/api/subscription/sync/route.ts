
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { stripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const token = authHeader.split("Bearer ")[1];
        console.log("[Subscription Sync] Verifying token...");
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userId = decodedToken.uid;
        console.log(`[Subscription Sync] Verified user: ${userId}`);

        const userRef = adminDb.collection("users").doc(userId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            // Create default user doc if missing
            await userRef.set({
                email: decodedToken.email,
                createdAt: new Date().toISOString(),
                tier: "free",
                plan: "free",
                subscription: {
                    status: "active", // Free tier is always active
                    tier: "free",
                    cancel_at_period_end: false,
                    current_period_end: null
                },
                aiUsage: { count: 0, resetDate: new Date().toISOString() }
            });
            return NextResponse.json({ status: "synced", tier: "free" });
        }

        const userData = userDoc.data();
        const stripeCustomerId = userData?.stripeCustomerId;

        if (!stripeCustomerId) {
            // Should be free tier or needs customer creation
            // Assuming free for now if no stripe ID
            await userRef.update({
                tier: "free",
                subscription: {
                    status: "active",
                    tier: "free",
                    cancel_at_period_end: false,
                    current_period_end: null
                }
            });
            return NextResponse.json({ status: "synced", tier: "free" });
        }

        // Fetch subscriptions from Stripe
        const subscriptions = await stripe.subscriptions.list({
            customer: stripeCustomerId,
            status: "all",
            limit: 1,
        });
        console.log(`[Subscription Sync] Found ${subscriptions.data.length} subscriptions for customer ${stripeCustomerId}`);

        if (subscriptions.data.length === 0) {
            // No active subscription found -> Free
            await userRef.update({
                tier: "free",
                subscription: {
                    status: "canceled",
                    tier: "free",
                    cancel_at_period_end: false,
                    current_period_end: null
                }
            });
            return NextResponse.json({ status: "synced", tier: "free" });
        }

        const sub = subscriptions.data[0];
        const isActive = sub.status === "active" || sub.status === "trialing";
        const tier = isActive ? "premium" : "free";

        // Update Firestore
        await userRef.update({
            tier: tier,
            subscription: {
                status: sub.status,
                tier: tier,
                cancel_at_period_end: sub.cancel_at_period_end,
                current_period_end: (sub as any).current_period_end
                    ? new Date((sub as any).current_period_end * 1000).toISOString()
                    : null,
            },
            updatedAt: new Date().toISOString()
        });

        return NextResponse.json({ status: "synced", tier, subscription: sub.status });

    } catch (error: any) {
        console.error("Subscription Sync Error:", error);
        console.error("Stack:", error?.stack);
        return NextResponse.json({ error: "Internal Server Error", details: error?.message }, { status: 500 });
    }
}
