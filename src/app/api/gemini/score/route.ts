import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { adminDb } from "@/lib/firebase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import crypto from "crypto";

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

// Cache validity duration: 30 days
const CACHE_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
    try {
        // Simple rate limiting based on IP
        const ip = request.ip || request.headers.get("x-forwarded-for") || "unknown";
        const rateLimit = await checkRateLimit(`gemini_score_${ip}`, { limit: 10, windowMs: 60 * 1000 }); // 10 per minute

        if (rateLimit.limitReached) {
            return NextResponse.json({ error: "Too many requests. Please try again in a minute." }, { status: 429 });
        }

        const { placeId, name, dietary, reviews } = await request.json();

        if (!placeId || !name || !dietary) {
            return NextResponse.json({ error: "Missing required fields (placeId, name, dietary)" }, { status: 400 });
        }

        // Create deterministic hash for dietary preferences to use as part of cache key
        // Sort keys to ensure consistent hash regardless of object property order
        const dietaryString = JSON.stringify(dietary, Object.keys(dietary).sort());
        const dietaryHash = crypto.createHash('md5').update(dietaryString).digest('hex');

        const cacheKey = `${placeId}_${dietaryHash}`;

        // Check Firestore Cache
        const cacheRef = adminDb.collection('restaurant_scores').doc(cacheKey);
        const cacheDoc = await cacheRef.get();

        if (cacheDoc.exists) {
            const data = cacheDoc.data();
            const now = Date.now();
            // Check if cache is still valid
            if (data && data.timestamp && (now - data.timestamp < CACHE_DURATION_MS)) {
                console.log(`Cache HIT for ${name}`);
                return NextResponse.json(data.score);
            }
        }

        console.log(`Cache MISS for ${name}, calling Gemini...`);

        let reviewText = "";

        // If we don't have reviews in the request (typical case for list view items), fetch them.
        if (!reviews || reviews.length === 0) {
            console.log(`Fetching details for ${placeId}...`);
            const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,reviews&key=${process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY}`;
            const detailsRes = await fetch(detailsUrl);
            const detailsData = await detailsRes.json();

            if (detailsData.result && detailsData.result.reviews) {
                reviewText = detailsData.result.reviews.map((r: { text: string }) => r.text).join("\n");
            } else {
                console.log("No reviews found for", placeId);
                // We can still try to score based on name/type if we had it, but for now fallback
                return NextResponse.json({ error: "No reviews available for analysis" }, { status: 404 });
            }
        } else {
            reviewText = reviews.map((r: { text: string }) => r.text).join("\n");
        }

        const prompt = `
      Analyze these restaurant reviews for dietary suitability.
      Restaurant: ${name}
      User requirements: ${JSON.stringify(dietary)}
      Reviews: ${reviewText}
      
      Output JSON only:
      {
        "dietaryScore": 0-5 (float),
        "fitReason": "brief explanation",
        "recommendedDishes": ["dish1", "dish2"],
        "warnings": ["may contain dairy"] or []
      }
    `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Clean up markdown code blocks if present
        const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
        const json = JSON.parse(jsonStr);

        // Save to Firestore
        await cacheRef.set({
            placeId,
            dietaryHash,
            score: json,
            timestamp: Date.now()
        });

        return NextResponse.json(json);
    } catch (error) {
        console.error("Gemini/Firestore Error:", error);
        return NextResponse.json({ error: "AI analysis failed" }, { status: 500 });
    }
}
