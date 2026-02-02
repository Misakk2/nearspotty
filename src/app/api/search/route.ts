import { NextRequest, NextResponse } from "next/server";
import { getCache, setCache, createCacheKey } from "@/lib/cache-utils";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { checkAIUsage, incrementAIUsage } from "@/lib/ai-usage";
import { scorePlacesWithDeepContext, PlaceWithContext } from "@/lib/gemini";

/**
 * Deep Search API Route - The "Dietary Engine"
 * 
 * Orchestrates the full AI pipeline:
 * 1. Broad Fetch (Google Places)
 * 2. Deep Enrichment (Fetch Details parallel)
 * 3. Pre-processing (Review filtering)
 * 4. Batch AI Scoring (Gemini)
 */
export async function GET(request: NextRequest) {
    console.log("[Deep Search] Request received");
    // --- 1. Authenticate & Quota Check ---
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return NextResponse.json({ error: "Authentication required", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const token = authHeader.split("Bearer ")[1];
    let userId: string;

    try {
        const decodedToken = await adminAuth.verifyIdToken(token);
        userId = decodedToken.uid;
    } catch (error) {
        return NextResponse.json({ error: "Invalid token", code: "INVALID_TOKEN" }, { status: 401 });
    }

    // Check Usage (Non-blocking for this route? Or blocking? The user prompt implies limit management)
    // We will assume standard check.
    let usageStatus;
    try {
        usageStatus = await checkAIUsage(userId);
    } catch (e) {
        // Fallback or init user if needed (omitted for brevity, assume user exists or handled by client/hooks)
        console.error("Usage check failed", e);
        usageStatus = { remaining: 0, limitReached: true, tier: 'free' };
    }

    // --- 2. Parse Params ---
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get("lat") || "0");
    const lng = parseFloat(searchParams.get("lng") || "0");
    const radius = parseFloat(searchParams.get("radius") || "3000"); // Default 3km
    const keyword = searchParams.get("keyword") || "restaurant";

    // --- 3. Broad Fetch (Google Places v1) ---
    const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY;
    if (!API_KEY) return NextResponse.json({ error: "Server Config Error" }, { status: 500 });

    try {
        const broadEndpoint = "https://places.googleapis.com/v1/places:searchNearby";
        const broadBody = {
            includedTypes: ["restaurant", "cafe", "bakery"], // Broad categories
            locationRestriction: {
                circle: { center: { latitude: lat, longitude: lng }, radius: radius }
            },
            maxResultCount: 20 // Fetch 20, we will deep process top 10
        };

        console.log("[Deep Search] Fetching Broad Candidates from:", broadEndpoint);
        const broadRes = await fetch(broadEndpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": API_KEY,
                "X-Goog-FieldMask": "places.displayName,places.id,places.types,places.priceLevel,places.rating,places.userRatingCount,places.formattedAddress,places.location"
            },
            body: JSON.stringify(broadBody)
        });

        const broadData = await broadRes.json();
        if (!broadData.places) return NextResponse.json({ results: [] });

        // Filter: Basic Hard Filters (e.g. must have rating > 3.0)
        let candidates = broadData.places.filter((p: any) => (p.rating || 0) >= 3.5);

        // Limit to Top 10 for Deep Fetch to save cost/latency
        candidates = candidates.slice(0, 10);

        // --- 4. Deep Fetch (Parellel Details) ---
        // We need: editorialSummary, reviews, servesVegetarianFood, websiteUri
        const deepPromises = candidates.map(async (p: any) => {
            const detailsEndpoint = `https://places.googleapis.com/v1/places/${p.id}`;
            const fields = "editorialSummary,reviews,servesVegetarianFood,websiteUri,photos"; // Note: we already have address/location from broad fetch

            const detailRes = await fetch(`${detailsEndpoint}?fields=${fields}&key=${API_KEY}`);
            const detailData = await detailRes.json();

            // Merge detailData into p if needed, but Google Places Deep Fetch returns separate object.
            // Actually, we use 'p' (candidate) for basic info and 'detailRes' for enrichment.
            // But wait! 'p' has 'photos' ONLY if we ask for it in Broad Fetch OR if detailData has it.
            // Broad Fetch field mask does NOT include photos. So p.photos is undefined?
            // Yes! p.photos is undefined in broad fetch if not requested.
            // Detail Fetch requests 'photos'. So we should use detailData.photos!

            // Correction: detailData holds the *new* fields.
            // Let's use detailData for photos.
            const photos = (await detailData).photos || [];

            // Map photos (New API format) -> Usable URL
            const photoUrl = photos?.[0]?.name
                ? `https://places.googleapis.com/v1/${photos[0].name}/media?maxHeightPx=400&maxWidthPx=400&key=${API_KEY}`
                : null;

            const primaryType = p.types?.[0] || 'restaurant';
            const placeName = p.displayName?.text || p.name || "Place"; // Use displayName.text (New API) or name (Legacy/Fallback)
            const fallbackImage = `https://placehold.co/600x400/orange/white?text=${encodeURIComponent(placeName)}`;

            return {
                place_id: p.id,
                name: placeName,
                types: p.types,
                rating: p.rating,
                user_ratings_total: p.userRatingCount,
                price_level: p.priceLevel ? (p.priceLevel === "PRICE_LEVEL_EXPENSIVE" ? 3 : (p.priceLevel === "PRICE_LEVEL_MODERATE" ? 2 : 1)) : 1,
                formatted_address: p.formattedAddress,
                vicinity: p.formattedAddress, // Fallback for legacy
                geometry: {
                    location: {
                        lat: p.location?.latitude || 0,
                        lng: p.location?.longitude || 0
                    }
                },
                // Normalize editorialSummary
                editorialSummary: (await detailData).editorialSummary?.text || (await detailData).editorialSummary,
                // Normalize reviews (Google Places v1 returns { text: { text: "...", languageCode: "en" } })
                reviews: (await detailData).reviews?.map((r: any) => ({
                    ...r,
                    text: r.text?.text || r.text // Extract inner text if object, else keep as is
                })) || [],
                websiteUri: (await detailData).websiteUri,
                servesVegetarianFood: (await detailData).servesVegetarianFood,
                photoUrl: photoUrl || fallbackImage, // Legacy field
                imageSrc: photoUrl || fallbackImage, // REQUIRED FIELD
                photos: photos || [],
                fallbackImageCategory: primaryType
            };
        });

        console.log(`[Deep Search] Fetching details for ${deepPromises.length} candidates...`);
        const enrichedPlaces: PlaceWithContext[] = await Promise.all(deepPromises);
        console.log("[Deep Search] Details fetched");

        // --- 5. Pre-processing (Review Filtering) ---
        // Fetch User Preferences
        const userDoc = await adminDb.collection("users").doc(userId).get();
        const preferences = userDoc.data()?.preferences || {};
        const allergyKeywords = (preferences.allergies || "").toLowerCase().split(",").map((k: string) => k.trim()).filter((k: string) => k);
        const dietKeywords = (preferences.dietary || []).map((k: string) => k.toLowerCase());

        const interestingKeywords = [...allergyKeywords, ...dietKeywords];

        enrichedPlaces.forEach(p => {
            // Filter reviews: Keep if matches keyword OR is highly rated
            if (Array.isArray(p.reviews) && interestingKeywords.length > 0) {
                const relevantReviews = p.reviews.filter((r: any) => {
                    if (!r || typeof r.text !== 'string') return false;
                    const text = r.text.toLowerCase();
                    return interestingKeywords.some(k => text.includes(k));
                });

                // Simple Heuristic Flagging for Gemini
                const safeKeywords = ["safe", "accommodat", "knowledgeable", "separate", "careful", "dedicated"];
                const riskKeywords = ["sick", "reaction", "contaminated", "cross", "hidden", "unsafe", "ignorant"];

                const flaggedReviews = (relevantReviews.length > 0 ? relevantReviews : p.reviews).map((r: any) => {
                    if (!r || typeof r.text !== 'string') return { ...r, flag: undefined };
                    const text = r.text.toLowerCase();
                    let flag = undefined;
                    if (riskKeywords.some(k => text.includes(k))) flag = "RISK";
                    else if (safeKeywords.some(k => text.includes(k))) flag = "SAFE_CANDIDATE";

                    return { ...r, flag };
                });

                // If found relevant ones, prioritize them. Else take top 3.
                if (relevantReviews.length > 0) {
                    p.reviews = flaggedReviews.slice(0, 5); // Increased to 5 as per instructions
                } else {
                    p.reviews = flaggedReviews.slice(0, 3);
                }
            } else if (Array.isArray(p.reviews)) {
                p.reviews = p.reviews.slice(0, 3); // Default to top 3
            } else {
                p.reviews = []; // Flag as empty if not array
            }
        });

        // --- 6. Batch AI Scoring ---
        let scoredPlaces = new Map();
        if (!usageStatus.limitReached) {
            console.log("[Deep Search] Scoring places with Gemini...");
            scoredPlaces = await scorePlacesWithDeepContext(enrichedPlaces, preferences);
            await incrementAIUsage(userId);
            console.log("[Deep Search] Scoring complete");
        }

        // --- 7. Formatting Response ---
        const finalResults = enrichedPlaces.map(p => ({
            ...p,
            ai_score: scoredPlaces.get(p.place_id) || null
        })).sort((a, b) => (b.ai_score?.matchScore || 0) - (a.ai_score?.matchScore || 0));

        return NextResponse.json({
            results: finalResults,
            usage: {
                remaining: usageStatus.remaining,
                limitReached: usageStatus.limitReached
            }
        });

    } catch (error: any) {
        console.error("CRITICAL SEARCH API CRASH:", error);
        console.error("Stack Trace:", error.stack);
        return NextResponse.json({
            error: "Internal Server Error",
            details: error.message,
            stack: error.stack
        }, { status: 500 });
    }
}
