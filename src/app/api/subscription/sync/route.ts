
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { stripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const token = authHeader.split("Bearer ")[1];
        console.log("[Subscription Sync] Verifying token...");
        const decodedToken = await getAdminAuth().verifyIdToken(token);
        const userId = decodedToken.uid;
        console.log(`[Subscription Sync] Verified user: ${userId}`);

        const userRef = getAdminDb().collection("users").doc(userId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            // Create default user doc if missing
            await userRef.set({
                email: decodedToken.email,
                tier: "free",
                subscription: {
                    status: "active",
                    tier: "free",
                    plan: "free",
                    cancelAtPeriodEnd: false,
                    currentPeriodEnd: null,
                    updatedAt: new Date().toISOString()
                },
                credits: {
                    remaining: 5,
                    used: 0,
                    resetDate: new Date().toISOString(),
                    limit: 5
                },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            return NextResponse.json({
                status: "synced",
                tier: "free",
                credits: { remaining: 5, limit: 5, used: 0 }
            });
        }

        const userData = userDoc.data();
        const stripeCustomerId = userData?.stripeCustomerId;

        if (!stripeCustomerId) {
            // Free tier - no Stripe customer
            await userRef.update({
                tier: "free",
                subscription: {
                    status: "active",
                    tier: "free",
                    plan: "free",
                    cancelAtPeriodEnd: false,
                    currentPeriodEnd: null,
                    updatedAt: new Date().toISOString()
                },
                updatedAt: new Date().toISOString()
            });

            const credits = userData?.credits || { remaining: 5, used: 0, limit: 5 };
            return NextResponse.json({
                status: "synced",
                tier: "free",
                credits: { remaining: credits.remaining, limit: 5, used: credits.used }
            });
        }

        // Fetch subscriptions from Stripe
        const subscriptions = await stripe.subscriptions.list({
            customer: stripeCustomerId,
            status: "all",
            limit: 1,
        });
        console.log(`[Subscription Sync] Found ${subscriptions.data.length} subscriptions for customer ${stripeCustomerId}`);

        if (subscriptions.data.length === 0) {
            // No subscription -> downgrade to free
            await userRef.update({
                tier: "free",
                subscription: {
                    status: "canceled",
                    tier: "free",
                    plan: "free",
                    cancelAtPeriodEnd: false,
                    currentPeriodEnd: null,
                    updatedAt: new Date().toISOString()
                },
                credits: {
                    remaining: 5,
                    used: 0,
                    resetDate: new Date().toISOString(),
                    limit: 5
                },
                updatedAt: new Date().toISOString()
            });
            return NextResponse.json({
                status: "synced",
                tier: "free",
                credits: { remaining: 5, limit: 5, used: 0 }
            });
        }

        const sub = subscriptions.data[0];
        const isActive = sub.status === "active" || sub.status === "trialing";
        const tier = isActive ? "premium" : "free";

        // Update Firestore with new schema
        await userRef.update({
            tier: tier,
            subscription: {
                status: sub.status,
                tier: tier,
                plan: tier,
                stripeSubscriptionId: sub.id,
                cancelAtPeriodEnd: sub.cancel_at_period_end,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                currentPeriodEnd: (sub as any).current_period_end
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ? new Date((sub as any).current_period_end * 1000).toISOString()
                    : null,
                updatedAt: new Date().toISOString()
            },
            credits: {
                remaining: tier === 'premium' ? -1 : 5,
                used: 0,
                resetDate: new Date().toISOString(),
                limit: tier === 'premium' ? -1 : 5
            },
            updatedAt: new Date().toISOString()
        });

        const credits = tier === 'premium'
            ? { remaining: -1, limit: -1, used: 0 }
            : { remaining: 5, limit: 5, used: 0 };

        return NextResponse.json({
            status: "synced",
            tier,
            subscription: sub.status,
            credits
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error("Subscription Sync Error:", error);

        // Handle Invalid Token Errors specifically
        if (error?.codePrefix === 'auth' ||
            error?.message?.includes('no "kid" claim') ||
            error?.message?.includes('Decoding Firebase ID token failed')) {
            return NextResponse.json({ error: "Unauthorized", details: "Invalid Token" }, { status: 401 });
        }

        console.error("Stack:", error?.stack);
        return NextResponse.json({ error: "Internal Server Error", details: error?.message }, { status: 500 });
    }
}
