/**
 * Batch Gemini scoring endpoint for multiple restaurants.
 * 
 * Scores multiple restaurants in a single Gemini API call for efficiency.
 * Uses user profile hash for caching - scores are cached per user preferences.
 * OPTIMIZED: Returns "Lite" scores (no pros/cons) to save tokens.
 */

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { adminDb } from "@/lib/firebase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkUserLimit, incrementUserUsage } from "@/lib/user-limits";
import crypto from "crypto";
import { GeminiScore } from "@/types";

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
    try {
        // Rate limiting
        const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
        const rateLimit = await checkRateLimit(`gemini_batch_${ip}`, { limit: 5, windowMs: 60 * 1000 });

        if (rateLimit.limitReached) {
            return NextResponse.json({ error: "Too many requests. Please try again in a minute." }, { status: 429 });
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
                    count: usageStatus.count,
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
            const cacheRef = adminDb.collection('restaurant_scores').doc(cacheKey);
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
        const GEMINI_TIMEOUT_MS = 25000;

        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const racePromise = Promise.race([
                model.generateContent({
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("GEMINI_TIMEOUT")), GEMINI_TIMEOUT_MS)
                )
            ]);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await racePromise as any;

            const response = await result.response;
            const text = response.text();

            // Parse response
            const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let scores: any[];

            try {
                scores = JSON.parse(jsonStr);
            } catch {
                console.error("[BatchScore] Failed to parse:", text);
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
                await adminDb.collection('restaurant_scores').doc(cacheKey).set({
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

            // Increment usage
            if (userId && uncachedPlaces.length > 0) {
                await incrementUserUsage(userId);
            }

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
            // clearTimeout(timeoutId); // Removed
            console.error("[BatchScore] API Error:", error);
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
