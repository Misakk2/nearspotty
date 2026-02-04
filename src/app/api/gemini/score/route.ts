import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { checkUserLimit, incrementUserUsage } from "@/lib/user-limits";
import crypto from "crypto";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

// Cache validity duration: 30 days
const CACHE_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
    try {
        const { placeId, name, dietary, reviews } = await request.json();

        if (!placeId || !name || !dietary) {
            return NextResponse.json({ error: "Missing required fields (placeId, name, dietary)" }, { status: 400 });
        }

        // 1. AUTHENTICATION (Bearer Token)
        let userId: string | null = null;
        const authHeader = request.headers.get("Authorization");
        if (authHeader?.startsWith("Bearer ")) {
            try {
                const token = await adminAuth.verifyIdToken(authHeader.split("Bearer ")[1]);
                userId = token.uid;
            } catch (e) {
                console.error("Token invalid:", e);
                // We might allow anonymous if we have a strict IP limit, but for now let's be strict or fallback?
                // Request says: "User searches for a place". Place Detail usually requires auth?
                // Let's enforce auth for billing.
            }
        }

        // 2. BILLING CHECK
        if (userId) {
            const status = await checkUserLimit(userId);
            if (status.limitReached) {
                return NextResponse.json({ error: "Limit reached", code: "LIMIT_REACHED" }, { status: 402 });
            }
        } else {
            // Require Auth for AI features to prevent abuse
            return NextResponse.json({ error: "Authentication required for AI analysis" }, { status: 401 });
        }

        // Create deterministic hash for dietary preferences to use as part of cache key
        const dietaryString = JSON.stringify(dietary, Object.keys(dietary).sort());
        const dietaryHash = crypto.createHash('md5').update(dietaryString).digest('hex');
        const cacheKey = `${placeId}_${dietaryHash}`;

        // Check Firestore Cache
        const cacheRef = adminDb.collection('restaurant_scores').doc(cacheKey);
        const cacheDoc = await cacheRef.get();

        if (cacheDoc.exists) {
            const data = cacheDoc.data();
            const now = Date.now();
            if (data && data.timestamp && (now - data.timestamp < CACHE_DURATION_MS)) {
                console.log(`Cache HIT for ${name}`);
                // Cache hit = FREE? Or do we count it? 
                // Usually cache hits are free. Only charge for GENERATION.
                return NextResponse.json(data.score);
            }
        }

        console.log(`Cache MISS for ${name}, calling Gemini...`);

        // 3. FETCH REVIEWS (V1 MIGRATION)
        let reviewText = "";

        if (!reviews || reviews.length === 0) {
            console.log(`Fetching details for ${placeId}...`);
            // V1 API
            const url = `https://places.googleapis.com/v1/places/${placeId}`;
            const res = await fetch(url, {
                headers: {
                    "X-Goog-Api-Key": process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY!,
                    "X-Goog-FieldMask": "places.reviews,places.name"
                }
            });

            if (res.ok) {
                const data = await res.json();
                if (data.reviews) {
                    reviewText = data.reviews.map((r: any) => r.text?.text || "").join("\n");
                }
            } else {
                console.error("Failed to fetch reviews (V1)", res.status);
            }
        } else {
            reviewText = reviews.map((r: any) => r.text).join("\n");
        }

        if (!reviewText) {
            // Fallback or error?
            // Proceed with just name/type?
        }

        // 4. GENERATE CONTENT
        const prompt = `
      Analyze this restaurant for a user and determine how well it matches their preferences.
      
      Restaurant: ${name}
      User Profile: ${JSON.stringify(dietary)}
      Reviews: ${reviewText || "No reviews available."}
      
      Consider:
      - Dietary restrictions and allergies
      - Budget preference (low=€, medium=€€, high=€€€)
      - Favorite cuisines
      - Menu mentions in reviews
      
      Output JSON only (no markdown):
      {
        "matchScore": 0-100 (integer percentage of how well this place fits the user),
        "shortReason": "1-2 sentence explanation of the match",
        "pros": ["user-specific advantage 1", "advantage 2"],
        "cons": ["user-specific disadvantage 1"] or [],
        "recommendedDish": "single best dish for this user based on reviews",
        "warnings": ["allergy/dietary warning"] or []
      }
    `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Clean up markdown code blocks if present
        const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
        const json = JSON.parse(jsonStr);

        // Ensure matchScore is in valid range
        if (typeof json.matchScore === 'number') {
            json.matchScore = Math.max(0, Math.min(100, Math.round(json.matchScore)));
        }

        // Save to Firestore
        await cacheRef.set({
            placeId,
            dietaryHash,
            score: json,
            timestamp: Date.now()
        });

        // 5. BILLING (Increment)
        if (userId) {
            await incrementUserUsage(userId);
        }

        return NextResponse.json(json);
    } catch (error) {
        console.error("Gemini/Firestore Error:", error);
        return NextResponse.json({ error: "AI analysis failed" }, { status: 500 });
    }
}
