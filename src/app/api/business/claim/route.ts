import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import Stripe from "stripe";

export async function POST(req: Request) {
    try {
        // 1. Auth Check
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const token = authHeader.split("Bearer ")[1];
        const decodedToken = await getAdminAuth().verifyIdToken(token);
        const uid = decodedToken.uid;

        // 2. Input (Parse body early to get sessionId for fallback check)
        const body = await req.json();
        const { placeId, details, sessionId } = body;

        // 1.5 Subscription Check (Strict Claiming)
        const userDoc = await getAdminDb().collection("users").doc(uid).get();
        const userData = userDoc.data();
        let hasActiveSubscription = ['active', 'trialing'].includes(userData?.subscription?.status || '');

        // Fallback: Check Stripe directly if Firestore is stale (Webhook race condition)
        // We check if either ID is present.
        if (!hasActiveSubscription && (userData?.stripeCustomerId || sessionId)) {
            try {
                const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
                    apiVersion: "2026-01-28.clover",
                });

                let sub: Stripe.Subscription | null = null;

                // Priority 1: Check by Session ID (Most accurate for immediate post-checkout)
                if (sessionId) {
                    try {
                        const session = await stripe.checkout.sessions.retrieve(sessionId);
                        if (session.subscription) {
                            sub = await stripe.subscriptions.retrieve(session.subscription as string);
                        }
                    } catch (err) {
                        console.warn(`[Claim] Failed to retrieve session ${sessionId}:`, err);
                    }
                }

                // Priority 2: Check by Customer ID (If session check failed or wasn't provided)
                if (!sub && userData?.stripeCustomerId) {
                    const subscriptions = await stripe.subscriptions.list({
                        customer: userData.stripeCustomerId,
                        status: 'all',
                        limit: 1,
                    });
                    if (subscriptions.data.length > 0) {
                        sub = subscriptions.data[0];
                    }
                }

                if (sub && ['active', 'trialing'].includes(sub.status)) {
                    console.log(`[Claim] Recovered subscription status from Stripe for ${uid}: ${sub.status}`);
                    hasActiveSubscription = true;

                    // Self-heal Firestore
                    await getAdminDb().collection("users").doc(uid).set({
                        subscription: {
                            status: sub.status,
                            tier: 'premium', // Assume premium if they have a sub
                            stripeSubscriptionId: sub.id,
                            updatedAt: new Date().toISOString()
                        }
                    }, { merge: true });
                }
            } catch (stripeError) {
                console.error("[Claim] Failed to check Stripe fallback:", stripeError);
            }
        }

        if (!hasActiveSubscription) {
            console.warn(`[Claim] User ${uid} attempted to claim without active subscription.`);
            return NextResponse.json({ error: "Active subscription required." }, { status: 403 });
        }

        // 3. Check Claim
        const db = getAdminDb();
        const docRef = db.collection("restaurants").doc(placeId);
        const docSnap = await docRef.get();

        if (docSnap.exists) {
            const data = docSnap.data();
            if (data?.isClaimed) {
                // If current user is already the owner, we update the details
                if (data.ownerId === uid) {
                    if (details) {
                        await docRef.set({
                            ...details,
                            updatedAt: new Date().toISOString()
                        }, { merge: true });
                    }
                    return NextResponse.json({ success: true, message: "Details updated" });
                }
                return NextResponse.json({ error: "Restaurant is already claimed" }, { status: 409 });
            }
        }

        // 4. Claim & Save Details
        const claimData = {
            isClaimed: true,
            ownerId: uid,
            claimedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            // Merge in provided details (name, address, cuisine, etc.)
            ...(details || {})
        };

        await docRef.set(claimData, { merge: true });

        // 5. Update User Role & Link (Redundant but safe)
        // We generally handle user profile updates on the client, but keeping data in sync is good.
        // For now, we trust the client to update the user doc, or we could do it here.

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Claim error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
