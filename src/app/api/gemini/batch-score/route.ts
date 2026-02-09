/**
 * Batch Gemini scoring endpoint for multiple restaurants.
 * 
 * Scores multiple restaurants in a single Gemini API call for efficiency.
 * Uses user profile hash for caching - scores are cached per user preferences.
 * OPTIMIZED: Returns "Lite" scores (no pros/cons) to save tokens.
 */

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { checkUserLimit } from "@/lib/user-limits";
import crypto from "crypto";
import { GeminiScore } from "@/types";
import { logGeminiUsage, calculateCost } from "@/lib/gemini"; // ✅ Updated import

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

// Cache duration: 7 days
const CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

interface BatchPlace {
    place_id: string;
    name: string;
    types: string[];
    rating?: number;
    price_level?: number;
    vicinity?: string;
}

interface BatchScoreResult {
    place_id: string;
    score: GeminiScore;
    cached: boolean;
}

export async function POST(request: NextRequest) {
    const startTime = Date.now();

    try {
        // --- Rate Limiting & Auth ---
        const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
        let rateLimitIdentifier = `gemini_ip_${ip}`;
        let rateLimitConfig = RATE_LIMITS.GEMINI.GUEST;

        // Attempt to upgrade to User-based limits
        const authHeader = request.headers.get("Authorization");
        if (authHeader?.startsWith("Bearer ")) {
            try {
                const token = authHeader.split("Bearer ")[1];
                const decodedToken = await getAdminAuth().verifyIdToken(token);
                // Use UID for rate limiting if authenticated
                rateLimitIdentifier = `gemini_user_${decodedToken.uid}`;

                // Fetch basic user info to determine Tier
                // Note: We avoid full user fetch here for speed if possible, but we need Tier.
                // We'll trust the UserLimits check later for Quota, but for Rate Limit we need Tier.
                // Let's do a quick fetch or optimistically assume Free/Premium based on claims if available?
                // For now, let's just default to FREE for auth users, and rely on `checkUserLimit` for the hard monthly quota.
                // Actually, `checkUserLimit` (line 64) is expensive too.

                // Let's try to get the user doc to be correct about PREMIUM rate limits.
                const userDoc = await getAdminDb().collection("users").doc(decodedToken.uid).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    const tier = userData?.subscription?.tier || 'free';
                    if (['premium', 'basic', 'pro', 'enterprise'].includes(tier)) {
                        rateLimitConfig = RATE_LIMITS.GEMINI.PREMIUM;
                    } else {
                        rateLimitConfig = RATE_LIMITS.GEMINI.FREE;
                    }
                }
            } catch (e) {
                console.warn("[BatchScore] Auth token verification failed:", e);
                // Fallback to Guest IP limits
            }
        }

        const { limitReached, reset } = await checkRateLimit(rateLimitIdentifier, rateLimitConfig);

        if (limitReached) {
            return NextResponse.json({
                error: "Too many requests. Please try again later.",
                reset: new Date(reset).toISOString()
            }, { status: 429 });
        }

        const { places, userProfile, userId } = await request.json();

        if (!places || !Array.isArray(places) || places.length === 0) {
            return NextResponse.json({ error: "Places array required" }, { status: 400 });
        }

        if (!userProfile) {
            return NextResponse.json({ error: "User profile required" }, { status: 400 });
        }

        // Check subscription limits
        let usageStatus = null;
        if (userId) {
            usageStatus = await checkUserLimit(userId);
            if (usageStatus.limitReached) {
                return NextResponse.json({
                    error: "AI check limit reached",
                    limitReached: true,
                    tier: usageStatus.tier,
                    remaining: usageStatus.remaining
                }, { status: 403 });
            }
        }

        // Limit batch size
        const maxBatchSize = 10;
        const placesToScore: BatchPlace[] = places.slice(0, maxBatchSize);

        // Create user profile hash for caching
        const profileString = JSON.stringify(userProfile, Object.keys(userProfile).sort());
        const profileHash = crypto.createHash('md5').update(profileString).digest('hex');

        const now = Date.now();
        const results: BatchScoreResult[] = [];
        const uncachedPlaces: BatchPlace[] = [];

        // Check cache for each place
        for (const place of placesToScore) {
            const cacheKey = `batch_${place.place_id}_${profileHash}`;
            const cacheRef = getAdminDb().collection('restaurant_scores').doc(cacheKey);
            const cacheDoc = await cacheRef.get();

            if (cacheDoc.exists) {
                const data = cacheDoc.data();
                if (data && data.timestamp && (now - data.timestamp < CACHE_DURATION_MS)) {
                    results.push({
                        place_id: place.place_id,
                        score: data.score as GeminiScore,
                        cached: true
                    });
                    continue;
                }
            }
            uncachedPlaces.push(place);
        }

        // If all are cached, return immediately
        if (uncachedPlaces.length === 0) {
            return NextResponse.json({ results, allCached: true });
        }

        // Build Optimised Batch Prompt
        // 1. Minify User JSON
        // 2. Reduce Instruction Verbosity
        // 3. Request Minimal Output (No pros/cons)

        const placesInfo = uncachedPlaces.map((p, i) =>
            `${i + 1}. "${p.name}" (${p.types.slice(0, 2).join(',')}) | Rat:${p.rating || '-'} | €${p.price_level || '-'}`
        ).join('\n');

        const prompt = `
Task: Score ${uncachedPlaces.length} places (0-100) for this user profile:
${JSON.stringify(userProfile)}

Places:
${placesInfo}

Rules:
- Match based on cuisine, budget, dietary.
- Return JSON Array based on index order.
- NO markdown.

Output Schema:
[
  {
    "matchScore": 0-100,
    "shortReason": "Very brief reason (max 10 words)",
    "recommendedDish": "Name of 1 dish or 'N/A'"
  }
]
`;

        // Timeout Handling using Promise.race (since signal might not be supported)
        const GEMINI_TIMEOUT_MS = 60000;

        let timeoutId: NodeJS.Timeout | null = null;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error("GEMINI_TIMEOUT")), GEMINI_TIMEOUT_MS);
        });

        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const racePromise = Promise.race([
                model.generateContent({
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                }),
                timeoutPromise
            ]);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await racePromise as any;
            if (timeoutId) clearTimeout(timeoutId); // ✅ Clear timeout on success

            const response = await result.response;
            const text = response.text();

            // ✅ Track Usage
            const metadata = await response.usageMetadata;
            if (metadata) {
                await logGeminiUsage({
                    operation: 'batch-lite',
                    tokensUsed: metadata.totalTokenCount || 0,
                    candidateCount: uncachedPlaces.length,
                    userId: userId || 'anonymous',
                    success: true,
                    latencyMs: Date.now() - startTime,
                    cost: calculateCost(metadata.totalTokenCount || 0),
                    timestamp: new Date()
                });
            }

            // Parse response
            const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let scores: any[];

            try {
                scores = JSON.parse(jsonStr);
            } catch {
                console.error("[BatchScore] Failed to parse:", text);

                // Log failure
                await logGeminiUsage({
                    operation: 'batch-lite',
                    tokensUsed: 0,
                    candidateCount: uncachedPlaces.length,
                    userId: userId || 'anonymous',
                    success: false,
                    latencyMs: Date.now() - startTime,
                    cost: 0,
                    timestamp: new Date()
                });

                return NextResponse.json({ error: "AI response parsing failed" }, { status: 500 });
            }

            // Cache and add results
            for (let i = 0; i < uncachedPlaces.length; i++) {
                const place = uncachedPlaces[i];
                const rawScore = scores[i] || {};

                const score: GeminiScore = {
                    matchScore: typeof rawScore.matchScore === 'number' ? Math.max(0, Math.min(100, Math.round(rawScore.matchScore))) : 50,
                    shortReason: rawScore.shortReason || "Analysis unavailable",
                    recommendedDish: rawScore.recommendedDish || "",
                    pros: [], // Empty for batch lite version
                    cons: [],
                    warnings: []
                };

                const cacheKey = `batch_${place.place_id}_${profileHash}`;
                // Async cache set (fire & forget-ish)
                await getAdminDb().collection('restaurant_scores').doc(cacheKey).set({
                    placeId: place.place_id,
                    profileHash,
                    score,
                    timestamp: now
                });

                results.push({
                    place_id: place.place_id,
                    score,
                    cached: false
                });
            }

            // Credits already decremented in checkUserLimit
            // No manual increment needed

            return NextResponse.json({
                results,
                allCached: false,
                scoredCount: uncachedPlaces.length,
                usage: usageStatus ? {
                    remaining: Math.max(0, usageStatus.remaining - 1),
                    tier: usageStatus.tier
                } : null
            });

        } catch (error) {
            if (timeoutId) clearTimeout(timeoutId);
            console.error("[BatchScore] API Error:", error);

            // Log error usage
            await logGeminiUsage({
                operation: 'batch-lite',
                tokensUsed: 0,
                candidateCount: uncachedPlaces.length,
                userId: userId || 'anonymous',
                success: false,
                latencyMs: Date.now() - startTime,
                cost: 0,
                timestamp: new Date()
            });

            // Check for timeout error string
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((error as any).message === "GEMINI_TIMEOUT") {
                return NextResponse.json({
                    error: "AI is taking too long. Please try again.",
                    code: "TIMEOUT"
                }, { status: 504 });
            }
            return NextResponse.json({ error: "AI Service Unavailable" }, { status: 503 });
        }

    } catch (error) {
        console.error("[BatchScore] Critical Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
