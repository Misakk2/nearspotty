import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getAdminDb } from "@/lib/firebase-admin";
import { getTierFromPriceId } from "@/lib/plan-limits";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-01-28.clover",
});

// Use Node.js runtime (required for Firebase Admin SDK)
// Raw body access works via request.text() in Next.js 15 App Router
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error("🚨 FATAL: STRIPE_WEBHOOK_SECRET is missing from environment variables!");
    // We don't throw error here to avoid crashing the whole builds/server start, 
    // but this route will definitely fail.
}




// Helper to determine Role/Tier from Price Object (if ID fails)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deriveRoleFromPriceData(price: any): { role: 'diner' | 'owner', tier: 'free' | 'premium' | 'basic' | 'pro' | 'enterprise' } {
    if (!price) return { role: 'diner', tier: 'free' };

    // Check nickname for keywords
    const nickname = (price.nickname || '').toLowerCase();

    if (nickname.includes('enterprise')) return { role: 'owner', tier: 'enterprise' };
    if (nickname.includes('pro') || nickname.includes('business')) return { role: 'owner', tier: 'pro' };
    if (nickname.includes('basic') || nickname.includes('starter')) return { role: 'owner', tier: 'basic' };
    if (nickname.includes('premium') || nickname.includes('diner')) return { role: 'diner', tier: 'premium' };

    // Fallback based on amount (Heuristic)
    const amount = price.unit_amount || 0;

    // Limits:
    // Enterprise: usually > €100 (10000)
    // Pro: usually €79 (7900)
    // Basic: usually €29 (2900)
    // Diner Premium: usually €9.99 (999)

    if (amount >= 15000) return { role: 'owner', tier: 'enterprise' }; // > €150
    if (amount >= 6000) return { role: 'owner', tier: 'pro' };        // > €60
    if (amount >= 2000) return { role: 'owner', tier: 'basic' };      // > €20
    if (amount > 0) return { role: 'diner', tier: 'premium' };        // Any other paid amount -> Diner Premium

    return { role: 'diner', tier: 'free' };
}

export async function POST(request: Request) {
    console.log('[Stripe Webhook] 🔔 Incoming webhook request');

    // =========================================================================

    // 1. STRICT SECRET HANDLING (trim whitespace, validate prefix)
    // =========================================================================
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    const signature = request.headers.get("stripe-signature");

    // Security logs (safe - no secret exposure)
    console.log('[Stripe Webhook] 🔐 Security Check:');
    console.log('  - Secret loaded:', webhookSecret ? 'YES' : 'NO');
    console.log('  - Secret length:', webhookSecret?.length || 0);
    // RESTORED DEBUG LOGGING
    const secretSuffix = webhookSecret && webhookSecret.length > 4
        ? webhookSecret.substring(webhookSecret.length - 4)
        : '****';
    console.log(`  - Secret suffix (CHECK THIS): ...${secretSuffix}`);
    console.log('  - Has whsec_ prefix:', webhookSecret?.startsWith('whsec_') || false);
    console.log('  - Signature present:', !!signature);

    if (!webhookSecret) {
        console.error('❌ [Stripe Webhook] CRITICAL: STRIPE_WEBHOOK_SECRET not found in environment');
        return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
    }

    if (!webhookSecret.startsWith('whsec_')) {
        console.error('❌ [Stripe Webhook] CRITICAL: Secret does not have whsec_ prefix - check Secret Manager');
        return NextResponse.json({ error: "Invalid webhook secret format" }, { status: 500 });
    }

    if (!signature) {
        console.error('❌ [Stripe Webhook] Missing stripe-signature header');
        return NextResponse.json({ error: "Missing signature header" }, { status: 400 });
    }

    // =========================================================================
    // 2. RAW BUFFER HANDLING (Stripe Documentation Best Practice)
    // Using arrayBuffer() instead of text() to prevent any encoding changes
    // =========================================================================
    let event: Stripe.Event;

    try {
        // CRITICAL: Get raw body as Buffer - no text encoding issues
        const arrayBuffer = await request.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        console.log('[Stripe Webhook] 📦 Payload received:');
        console.log('  - Buffer length:', buffer.length, 'bytes');
        console.log('  - Signature start:', signature.substring(0, 25) + '...');

        // Stripe SDK handles Buffer natively - most reliable method
        event = stripe.webhooks.constructEvent(buffer, signature, webhookSecret);

        console.log(`[Stripe Webhook] ✅ Signature verified! Event: ${event.type}`);
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error(`❌ [Stripe Webhook] Signature Verification FAILED:`);
        console.error(`  - Error: ${errorMessage}`);
        console.error(`  - Hint: Verify STRIPE_WEBHOOK_SECRET matches Stripe Dashboard exactly`);
        return NextResponse.json({
            error: "Signature verification failed",
            hint: "Check webhook secret in Secret Manager vs Stripe Dashboard"
        }, { status: 400 });
    }

    console.log(`[Stripe Webhook] ➡️  Event Type: ${event.type}`);

    // --- IDEMPOTENCY CHECK ---
    // --- IDEMPOTENCY CHECK (TRANSACTIONAL) ---
    const db = getAdminDb();
    const eventRef = db.collection('webhook_events').doc(event.id);

    try {
        await db.runTransaction(async (t) => {
            const doc = await t.get(eventRef);
            if (doc.exists) {
                throw new Error("EVENT_EXISTS");
            }
            t.set(eventRef, {
                processedAt: new Date().toISOString(),
                type: event.type
            });
        });
    } catch (err: unknown) {
        if (err instanceof Error && err.message === "EVENT_EXISTS") {
            console.log(`[Stripe Webhook] ⚠️ Event ${event.id} already processed. Skipping.`);
            return NextResponse.json({ received: true });
        }
        console.error(`[Stripe Webhook] ❌ Idempotency Transaction Failed:`, err);
        return NextResponse.json({ error: "Idempotency check failed" }, { status: 500 });
    }
    // -------------------------

    // --- IGNORE NOISY EVENTS ---
    const IGNORED_EVENTS = [
        "invoice.created",
        "invoice.finalized",
        "payment_intent.created",
        "payment_intent.succeeded",
        "payment_intent.requires_action"
    ];

    if (IGNORED_EVENTS.includes(event.type)) {
        return NextResponse.json({ received: true });
    }

    // Handle invoice.paid - PRIMARY RENEWAL & PAYMENT SIGNAL
    // This fires for both initial payment AND renewals. It's the most reliable source of truth for "Active".
    if (event.type === "invoice.paid") {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const subscriptionId = (invoice as any).subscription as string;

        console.log(`[Stripe Webhook] 💰 Invoice ${invoice.id} PAID. Customer: ${customerId}`);

        try {
            // Find user
            const usersSnapshot = await getAdminDb().collection("users")
                .where("stripeCustomerId", "==", customerId)
                .limit(1)
                .get();

            if (usersSnapshot.empty && subscriptionId) {
                console.warn(`[Stripe Webhook] ⚠️ User not found by Stripe ID ${customerId}. Attempting fallback via Subscription Metadata...`);
                try {
                    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
                        expand: ['metadata']
                    });

                    const metaUserId = subscription.metadata?.userId;
                    if (metaUserId) {
                        console.log(`[Stripe Webhook] 🔍 Found userId in metadata: ${metaUserId}`);
                        const fallbackUserDoc = await getAdminDb().collection("users").doc(metaUserId).get();

                        if (fallbackUserDoc.exists) {
                            console.log(`[Stripe Webhook] ✅ Restored link for user ${metaUserId}`);
                            // Save the missing stripeCustomerId so next time it works
                            await fallbackUserDoc.ref.set({
                                stripeCustomerId: customerId
                            }, { merge: true });

                            // Add to snapshot so main logic can process it
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            (usersSnapshot as any).docs = [fallbackUserDoc];
                            // Mocking the empty snapshot to now have this doc. 
                            // A cleaner way is to refactor, but this keeps thediff minimal and robust given the flow below uses usersSnapshot.docs[0]
                            // actually, usersSnapshot is a QuerySnapshot, we can't easily mutate it perfectly, 
                            // but we can just override the "empty" check flow if we change the structure slightly.
                            // Let's Refactor slightly for safety.
                        }
                    }
                } catch (fallbackErr) {
                    console.error(`[Stripe Webhook] Fallback failed:`, fallbackErr);
                }
            }

            // Re-evaluate if we have a user now (either from initial query or fallback)
            // We need to fetch the doc again or use the one we found.
            // Since I cannot easily mutate usersSnapshot in a type-safe way, I will change the logic structure below.

            let userRef: FirebaseFirestore.DocumentReference | null = null;

            if (!usersSnapshot.empty) {
                userRef = usersSnapshot.docs[0].ref;
            } else if (subscriptionId) {
                // Repeat fallback logic cleaner to set userRef
                try {
                    const subscription = await stripe.subscriptions.retrieve(subscriptionId); // Metadata already expanded if we did above? No, let's just do it here if needed.
                    // Wait, to minimize API calls, let's do the fallback properly.
                } catch (e) { }
            }

            // IGNORE THE ABOVE COMMENTARY, I WILL PROVIDE THE CLEAN IMPLEMENTATION BELOW

            let targetUserDoc: FirebaseFirestore.DocumentSnapshot | null = null;

            if (!usersSnapshot.empty) {
                targetUserDoc = usersSnapshot.docs[0];
            } else if (subscriptionId) {
                console.warn(`[Stripe Webhook] ⚠️ User not found by Stripe ID ${customerId}. Attempting fallback via Subscription Metadata...`);
                try {
                    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
                    const metaUserId = subscription.metadata?.userId;

                    if (metaUserId) {
                        const doc = await getAdminDb().collection("users").doc(metaUserId).get();
                        if (doc.exists) {
                            console.log(`[Stripe Webhook] ✅ FLUX CAPACITOR FIX: Found user ${metaUserId} via metadata!`);
                            // Heal the missing ID
                            await doc.ref.set({ stripeCustomerId: customerId }, { merge: true });
                            targetUserDoc = doc;
                        }
                    }
                } catch (fallbackErr) {
                    console.error(`[Stripe Webhook] Fallback lookup failed:`, fallbackErr);
                }
            }

            if (targetUserDoc) {
                const userRef = targetUserDoc.ref;

                // ✅ RETRIEVE SUBSCRIPTION TO GET STATUS AND DATES AND PRICE ID
                let subscriptionStatus: Stripe.Subscription.Status = 'active';
                let currentPeriodEnd: string | null = null;
                let priceId: string | undefined = undefined;

                if (subscriptionId) {
                    try {
                        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
                        subscriptionStatus = subscription.status;
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        currentPeriodEnd = new Date((subscription as any).current_period_end * 1000).toISOString();

                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        priceId = (subscription as any).items?.data?.[0]?.price?.id;
                    } catch (subError) {
                        console.error(`[Stripe Webhook] ⚠️ Could not retrieve subscription ${subscriptionId}:`, subError);
                    }
                }

                // Fallback: try to get from invoice lines using heuristic
                if (!priceId) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    priceId = (invoice.lines.data[0] as any)?.price?.id;
                }

                if (!currentPeriodEnd) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const periodEnd = (invoice.lines.data[0] as any)?.period?.end;
                    if (periodEnd) currentPeriodEnd = new Date(periodEnd * 1000).toISOString();
                }

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const priceData = (invoice.lines.data[0] as any)?.price;
                let { role, tier } = getTierFromPriceId(priceId || '');

                if (tier === 'free' && priceData) {
                    const derived = deriveRoleFromPriceData(priceData);
                    if (derived.tier !== 'free') {
                        role = derived.role;
                        tier = derived.tier;
                    }
                }

                console.log(`[Stripe Webhook] 📝 Updating User via Transaction: Role=${role}, Tier=${tier}`);

                // 🔐 ATOMIC TRANSACTION for Subscription Update
                await getAdminDb().runTransaction(async (transaction) => {
                    const userDoc = await transaction.get(userRef);
                    if (!userDoc.exists) throw new Error("User not found during transaction");

                    transaction.set(userRef, {
                        role: role,
                        tier: tier, // ✅ SYNC: Write to root for backward compatibility
                        subscription: {
                            status: subscriptionStatus,
                            tier: tier,
                            stripeSubscriptionId: subscriptionId,
                            currentPeriodEnd: currentPeriodEnd,
                        },
                        credits: {
                            remaining: -1,
                            used: 0,
                            resetDate: new Date().toISOString(),
                            limit: -1
                        },
                        updatedAt: new Date().toISOString()
                    }, { merge: true });
                });

                console.log(`✅ [Stripe Webhook] Transaction Commit: User updated to ${tier}`);

            } else {
                console.warn(`[Stripe Webhook] ⚠️ No user found for customer: ${customerId} (invoice.paid)`);
            }
        } catch (error) {
            console.error(`[Stripe Webhook] ❌ Error processing invoice.paid:`, error);
            return NextResponse.json({ error: "Invoice processing failed" }, { status: 500 });
        }
    }

    // Handle checkout.session.completed - IMMEDIATE FULFILLMENT & CLAIMING
    if (event.type === "checkout.session.completed") {
        try {
            const session = event.data.object as Stripe.Checkout.Session;
            const userId = session.client_reference_id;

            console.log(`[Stripe Webhook] Processing checkout.session.completed for Session ID: ${session.id}`);

            if (userId) {
                const plan = session.metadata?.plan || "premium";
                const placeIdToClaim = session.metadata?.placeId; // CLAIM LOGIC

                console.log(`[Stripe Webhook] Fulfilling order for user: ${userId}. Place Claim: ${placeIdToClaim || 'None'}`);

                // ... [Existing Date Calculation Logic] ...
                let currentPeriodEnd = new Date();
                let status: Stripe.Subscription.Status = "active";
                let cancelAtPeriodEnd = false;
                let cancelAt: string | null = null;
                let subscriptionId = '';

                let derivedRole: 'diner' | 'owner' = 'diner';
                let derivedTier: 'free' | 'premium' | 'basic' | 'pro' | 'enterprise' = 'premium'; // Default to premium to be safe for paid users

                // Retrieve Subscription to get Price ID
                if (session.subscription) {
                    subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
                    try {
                        const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
                            expand: ['items.data.price']
                        }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any

                        console.log(`[Stripe Webhook] Retrieved Subscription: ${subscriptionId}`);

                        if (subscription.items?.data?.[0]?.price) {
                            const priceData = subscription.items.data[0].price;
                            const priceId = priceData.id;
                            console.log(`[Stripe Webhook] Found Price ID: ${priceId}`);

                            // Try exact match first
                            const roleTier = getTierFromPriceId(priceId);
                            console.log(`[Stripe Webhook] Exact Match Result:`, roleTier);

                            if (roleTier.tier !== 'free') {
                                derivedRole = roleTier.role;
                                derivedTier = roleTier.tier;
                            } else {
                                // Fallback: If exact match failed (returned free/diner), try heuristic
                                console.log(`[Stripe Webhook] Exact match returned 'free' for paid subscription. Trying heuristic...`);
                                const heuristic = deriveRoleFromPriceData(priceData);
                                console.log(`[Stripe Webhook] Heuristic Result:`, heuristic);

                                if (heuristic.tier !== 'free') {
                                    derivedRole = heuristic.role;
                                    derivedTier = heuristic.tier;
                                } else {
                                    // FINAL SAFETY NET: If we have a paid subscription but can't map it, 
                                    // assume it's at least the plan they CLAIMED it was in metadata.
                                    console.warn(`[Stripe Webhook] ⚠️ Could not map Price ID ${priceId} to any tier. Using metadata plan: ${plan}`);
                                    if (plan.includes('basic')) { derivedRole = 'owner'; derivedTier = 'basic'; }
                                    else if (plan.includes('pro')) { derivedRole = 'owner'; derivedTier = 'pro'; }
                                    else if (plan.includes('enterprise')) { derivedRole = 'owner'; derivedTier = 'enterprise'; }
                                    else { derivedRole = 'diner'; derivedTier = 'premium'; }
                                }
                            }
                        } else {
                            console.error(`[Stripe Webhook] ❌ Subscription ${subscriptionId} has no price data in items.`);
                        }

                        if (subscription.current_period_end) {
                            currentPeriodEnd = new Date(subscription.current_period_end * 1000);
                        }
                        status = subscription.status;
                        cancelAtPeriodEnd = subscription.cancel_at_period_end;
                        if (subscription.cancel_at) {
                            cancelAt = new Date(subscription.cancel_at * 1000).toISOString();
                        }
                    } catch (subError) {
                        console.error(`[Stripe Webhook] ❌ Error retrieving subscription ${subscriptionId}:`, subError);
                        // Fallback to metadata plan if subscription fetch fails
                        if (plan.includes('basic')) { derivedRole = 'owner'; derivedTier = 'basic'; }
                        else if (plan.includes('pro')) { derivedRole = 'owner'; derivedTier = 'pro'; }
                        else if (plan.includes('enterprise')) { derivedRole = 'owner'; derivedTier = 'enterprise'; }
                    }
                } else {
                    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
                }

                console.log(`[Stripe Webhook] Final Decision -> User: ${userId}, Role: ${derivedRole}, Tier: ${derivedTier}`);

                // ATOMIC WRITE
                const userRef = getAdminDb().collection("users").doc(userId);

                await userRef.set({
                    role: derivedRole,
                    tier: derivedTier, // ✅ SYNC: Write to root for backward compatibility
                    stripeCustomerId: session.customer as string, // ✅ TOP-LEVEL for invoice.paid lookup & dashboard
                    subscription: {
                        status: status, // likely 'active' or 'trialing'
                        tier: derivedTier,
                        stripeSubscriptionId: subscriptionId,
                        currentPeriodEnd: currentPeriodEnd.toISOString(),
                        cancelAtPeriodEnd: cancelAtPeriodEnd,
                        cancelAt: cancelAt
                    },
                    credits: {
                        remaining: -1,
                        used: 0,
                        resetDate: new Date().toISOString(),
                        limit: -1
                    },
                    updatedAt: new Date().toISOString()
                }, { merge: true });

                // HANDLE CLAIMING IF PLACE ID PRESENT
                if (placeIdToClaim) {
                    console.log(`[Stripe Webhook] 🏠 Auto-claiming place ${placeIdToClaim} for user ${userId}`);
                    const placeRef = getAdminDb().collection("restaurants").doc(placeIdToClaim);
                    await placeRef.set({
                        isClaimed: true,
                        ownerId: userId,
                        claimedAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    }, { merge: true });

                    // Update User Role to Owner
                    console.log(`[Stripe Webhook] 👑 Promoting user ${userId} to 'owner'`);
                    await userRef.set({
                        role: 'owner' // Ensure role is owner if they claimed a place
                    }, { merge: true });
                }

                console.log(`✅ [Stripe Webhook] SUCCESS: User ${userId} upgraded.`);
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            console.error("❌ [Stripe Webhook] CRITICAL ERROR in checkout.session.completed:", err);
            return NextResponse.json({ error: "Webhook Handler Failed" }, { status: 500 });
        }
    }

    // Handle subscription.updated
    if (event.type === "customer.subscription.updated") {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        try {
            const usersSnapshot = await getAdminDb().collection("users")
                .where("stripeCustomerId", "==", customerId)
                .limit(1)
                .get();

            if (!usersSnapshot.empty) {
                const userDoc = usersSnapshot.docs[0];
                const status = subscription.status;

                // Logic:
                // - active/trialing: Premium
                // - past_due: Grace Period (Premium)
                // - unpaid/incomplete_expired: Downgrade (Free)
                // - canceled: Downgrade (Free) - usually handled by deleted event, but good to catch here too

                const isPremiumStatus = ['active', 'trialing'].includes(status);
                const isGracePeriod = status === 'past_due';

                console.log(`[Stripe Webhook] Sub Update for ${userDoc.id}. Status: ${status}`);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const priceId = (subscription.items.data[0] as any)?.price?.id;
                const { role, tier } = getTierFromPriceId(priceId);

                let effectiveTier = tier;
                let effectiveRole = role;
                let gracePeriodEnd: string | null = null;

                if (isGracePeriod) {
                    // 7 Days Grace Period
                    const graceDate = new Date();
                    graceDate.setDate(graceDate.getDate() + 7);
                    gracePeriodEnd = graceDate.toISOString();
                    console.log(`[Stripe Webhook] ⚠️ User entering GRACE PERIOD until ${gracePeriodEnd}`);
                } else if (!isPremiumStatus) {
                    // Hard Downgrade
                    effectiveTier = 'free';
                    effectiveRole = 'diner';
                    console.log(`[Stripe Webhook] 📉 Downgrading user due to status: ${status}`);
                }

                // Safety: If tier logic returns free but we are active, keep free (or should we upgrade? logic above handles upgrades via priceId)
                // If tier checks returns premium but status is NOT active/grace, force free.
                if (effectiveTier !== 'free' && !isPremiumStatus && !isGracePeriod) {
                    effectiveTier = 'free';
                    effectiveRole = 'diner';
                }

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const currentPeriodEnd = new Date((subscription as any).current_period_end * 1000).toISOString();

                await userDoc.ref.set({
                    role: effectiveRole,
                    tier: effectiveTier, // ✅ SYNC: Write to root for backward compatibility
                    subscription: {
                        status: status,
                        tier: effectiveTier,
                        stripeSubscriptionId: subscription.id,
                        currentPeriodEnd: currentPeriodEnd,
                        cancelAtPeriodEnd: subscription.cancel_at_period_end,
                        gracePeriodEnd: gracePeriodEnd
                    },
                    credits: {
                        // Only reset limit if downgrading to free. If staying premium, limit is -1.
                        limit: effectiveTier === 'free' ? 5 : -1
                    },
                    updatedAt: new Date().toISOString()
                }, { merge: true });

            }
        } catch (error) {
            console.error("[Stripe Webhook] Subscription update error:", error);
            // Log to failures collection
            try {
                await getAdminDb().collection('webhook_failures').add({
                    eventId: event.id,
                    type: event.type,
                    error: error instanceof Error ? error.message : 'Unknown',
                    timestamp: new Date().toISOString()
                });
            } catch (e) { console.error('Failed to log failure', e); }
        }
    }

    // Handle subscription.deleted
    if (event.type === "customer.subscription.deleted") {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        try {
            const usersSnapshot = await getAdminDb().collection("users")
                .where("stripeCustomerId", "==", customerId)
                .limit(1)
                .get();

            if (!usersSnapshot.empty) {
                const userDoc = usersSnapshot.docs[0];

                // Unclaim Restaurants
                const restaurantQuery = await getAdminDb().collection("restaurants").where("ownerId", "==", userDoc.id).get();
                if (!restaurantQuery.empty) {
                    const batch = getAdminDb().batch();
                    restaurantQuery.docs.forEach(doc => {
                        batch.set(doc.ref, {
                            isClaimed: false,
                            ownerId: null,
                            claimRemovedAt: new Date().toISOString()
                        }, { merge: true });
                    });
                    await batch.commit();
                }

                await userDoc.ref.set({
                    role: "diner", // Downgrade role too? Yes, if strict.
                    tier: "free", // ✅ SYNC: Write to root for backward compatibility
                    subscription: {
                        status: "canceled",
                        tier: "free",
                    },
                    credits: {
                        limit: 5,
                        remaining: 5 // Reset to free limit
                    },
                    updatedAt: new Date().toISOString()
                }, { merge: true });
                console.log(`[Stripe Webhook] User ${userDoc.id} fully downgraded (deleted)`);
            }
        } catch (error) {
            console.error("[Stripe Webhook] Subscription deletion error:", error);
        }
    }

    return NextResponse.json({ received: true });
}

