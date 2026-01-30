/**
 * Batch Gemini scoring endpoint for multiple restaurants.
 * 
 * Scores multiple restaurants in a single Gemini API call for efficiency.
 * Uses user profile hash for caching - scores are cached per user preferences.
 */

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { adminDb } from "@/lib/firebase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkAIUsage, incrementAIUsage } from "@/lib/ai-usage";
import crypto from "crypto";
import { GeminiScore } from "@/types";

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

// Cache duration: 7 days (shorter than individual scores since batch may be less accurate)
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
        const ip = request.ip || request.headers.get("x-forwarded-for") || "unknown";
        const rateLimit = await checkRateLimit(`gemini_batch_${ip}`, { limit: 5, windowMs: 60 * 1000 }); // 5 per minute

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

        // Check subscription limits if userId provided
        let usageStatus = null;
        if (userId) {
            usageStatus = await checkAIUsage(userId);

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

        console.log(`[BatchScore] ${results.length} cached, ${uncachedPlaces.length} to score`);

        // If all are cached, return immediately
        if (uncachedPlaces.length === 0) {
            return NextResponse.json({ results, allCached: true });
        }

        // Build batch prompt for uncached places
        const placesInfo = uncachedPlaces.map((p, i) =>
            `${i + 1}. "${p.name}" - Type: ${p.types.slice(0, 3).join(', ')} | Rating: ${p.rating || 'N/A'} | Price: ${'€'.repeat(p.price_level || 1)} | Location: ${p.vicinity || 'N/A'}`
        ).join('\n');

        const prompt = `
Score these ${uncachedPlaces.length} restaurants for a user with these preferences:
${JSON.stringify(userProfile, null, 2)}

RESTAURANTS:
${placesInfo}

For EACH restaurant, provide a matchScore (0-100) based on:
- How well types/cuisine match user's favorite cuisines
- Price level vs user's budget preference
- Dietary compatibility based on restaurant type

Output a JSON array (no markdown) with one object per restaurant in the same order:
[
  {
    "matchScore": 0-100,
    "shortReason": "1 sentence why this matches/doesn't match",
    "pros": ["advantage1"],
    "cons": ["disadvantage1"] or [],
    "recommendedDish": "likely good option based on cuisine type",
    "warnings": [] or ["concern"]
  }
]
`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Parse response
        const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
        let scores: GeminiScore[];

        try {
            scores = JSON.parse(jsonStr);
        } catch {
            console.error("[BatchScore] Failed to parse Gemini response:", text);
            return NextResponse.json({ error: "AI response parsing failed" }, { status: 500 });
        }

        // Cache and add results
        for (let i = 0; i < uncachedPlaces.length; i++) {
            const place = uncachedPlaces[i];
            const score = scores[i];

            if (score) {
                // Ensure matchScore is valid
                if (typeof score.matchScore === 'number') {
                    score.matchScore = Math.max(0, Math.min(100, Math.round(score.matchScore)));
                }

                // Cache this score
                const cacheKey = `batch_${place.place_id}_${profileHash}`;
                adminDb.collection('restaurant_scores').doc(cacheKey).set({
                    placeId: place.place_id,
                    profileHash,
                    score,
                    timestamp: now
                }).catch(err => console.error("[BatchScore] Cache failed:", err));

                results.push({
                    place_id: place.place_id,
                    score,
                    cached: false
                });
            }
        }

        // Increment usage count for authenticated users (only if we actually scored something)
        if (userId && uncachedPlaces.length > 0) {
            await incrementAIUsage(userId);
        }

        return NextResponse.json({
            results,
            allCached: false,
            scoredCount: uncachedPlaces.length,
            usage: usageStatus ? {
                remaining: usageStatus.remaining - 1,
                tier: usageStatus.tier
            } : null
        });

    } catch (error) {
        console.error("[BatchScore] Error:", error);
        return NextResponse.json({ error: "Batch scoring failed" }, { status: 500 });
    }
}
