
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { stripe } from "@/lib/stripe";
import { getTierFromPriceId } from "@/lib/plan-limits";

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
            // Check for Grace Period: If webhook recently updated to premium (< 60s ago), trust Firestore
            const lastUpdatedIso = userData?.subscription?.updatedAt;
            const lastUpdated = lastUpdatedIso ? new Date(lastUpdatedIso).getTime() : 0;
            const now = Date.now();
            const diff = now - lastUpdated;
            const isRecentUpdate = diff < 60000; // 60 seconds grace
            const isPremium = userData?.tier === "premium";

            console.log(`[Subscription Sync] 🔍 Grace Check (Empty List):`);
            console.log(`  - Tier: ${userData?.tier}`);
            console.log(`  - UpdatedAt: ${lastUpdatedIso} (${lastUpdated})`);
            console.log(`  - Now: ${new Date().toISOString()} (${now})`);
            console.log(`  - Diff: ${diff}ms`);
            console.log(`  - IsRecent: ${isRecentUpdate}, IsPremium: ${isPremium}`);

            if (isPremium && isRecentUpdate) {
                console.log(`[Subscription Sync] 🛡️ Grace Period Active: trusting Firestore (Premium) over empty Stripe list via race condition.`);
                // Return current Firestore state without overwriting
                return NextResponse.json({
                    status: "synced_grace_period",
                    tier: "premium",
                    subscription: "active",
                    credits: userData.credits || { remaining: -1, limit: -1, used: 0 }
                });
            }

            console.warn(`[Subscription Sync] 📉 Downgrading to free. Grace period failed or expired (Empty List).`);

            // No subscription -> downgrade to free
            await userRef.set({
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
                    used: 0, // Reset used on downgrade/cycle change
                    resetDate: new Date().toISOString(),
                    limit: 5
                },
                updatedAt: new Date().toISOString()
            }, { merge: true });

            return NextResponse.json({
                status: "synced",
                tier: "free",
                credits: { remaining: 5, limit: 5, used: 0 }
            });
        }

        const sub = subscriptions.data[0];
        const isActive = sub.status === "active" || sub.status === "trialing";

        // GRACE PERIOD CHECK FOR NON-ACTIVE STATUS
        // If Stripe says "incomplete" but we recently became premium via webhook (race condition), trust webhook
        if (!isActive) {
            const lastUpdatedIso = userData?.subscription?.updatedAt;
            const lastUpdated = lastUpdatedIso ? new Date(lastUpdatedIso).getTime() : 0;
            const now = Date.now();
            const diff = now - lastUpdated;
            const isRecentUpdate = diff < 60000;
            const isPremium = userData?.tier === "premium";

            if (isPremium && isRecentUpdate) {
                console.log(`[Subscription Sync] 🛡️ Grace Period Active: trusting Firestore (Premium) over Stripe status '${sub.status}'`);
                return NextResponse.json({
                    status: "synced_grace_period",
                    tier: "premium",
                    subscription: "active",
                    credits: userData.credits || { remaining: -1, limit: -1, used: 0 }
                });
            }
        }

        // Logic to determine tier from subscription items
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const priceId = (sub as any).items?.data?.[0]?.price?.id;
        const { tier } = getTierFromPriceId(priceId || '');

        // Use the tier directly if active. If not active, logic below might downgrade.
        // But if Stripe says active, trust the tier from Price ID.
        // If Price ID is unknown (tier='free'), but status is active, fallback to 'premium'?
        // No, better to trust the ID mapping. If unknown ID, it might be a new plan not in code.
        // But for safety, if active and tier is free, warn.

        if (isActive && tier === 'free') {
            console.warn(`[Subscription Sync] ⚠️ Active subscription ${sub.id} has unknown Price ID ${priceId}. Tier resolved to FREE.`);
        }

        // Preserve 'used' credits if tier hasn't changed to avoid resetting it mid-cycle
        const previousUsed = userData?.credits?.used || 0;


        // Only reset usage if moving from free->premium or premium->free, or if new billing cycle?
        // For now, simplify: if premium, limit is -1. If free, limit is 5. 
        // We preserve 'used' to be safe.

        const newCredits = {
            remaining: tier === 'premium' ? -1 : (5 - previousUsed > 0 ? 5 - previousUsed : 0),
            used: previousUsed,
            resetDate: userData?.credits?.resetDate || new Date().toISOString(),
            limit: tier === 'premium' ? -1 : 5
        };

        // Update Firestore with new schema
        await userRef.set({
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
            credits: newCredits,
            updatedAt: new Date().toISOString()
        }, { merge: true });

        return NextResponse.json({
            status: "synced",
            tier,
            subscription: sub.status,
            credits: newCredits
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
