import { NextRequest, NextResponse } from "next/server";
import { getCache, setCache, createCacheKey } from "@/lib/cache-utils";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { checkAIUsage, incrementAIUsage } from "@/lib/ai-usage";
import { scorePlacesWithDeepContext, PlaceWithContext } from "@/lib/gemini";

/**
 * Deep Search API Route - The "Dietary Engine"
 * 
 * Orchestrates the full AI pipeline:
 * 1. Caching Layer (Google Data)
 * 2. Broad Fetch (Google Places)
 * 3. Deep Enrichment (Fetch Details parallel - Optimized)
 * 4. Pre-processing (Review filtering)
 * 5. Batch AI Scoring (Gemini) with Fallback
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

    // --- 3. Google Data Acquisition (Cache First) ---
    try {
        // Round coordinates to 3 decimal places (~100m precision) to increase cache hit rate
        const latKey = parseFloat(lat.toFixed(3));
        const lngKey = parseFloat(lng.toFixed(3));

        // Generate Cache Key for GOOGLE DATA (User agnostic)
        const googleCacheKey = createCacheKey({
            type: "google_places",
            lat: latKey,
            lng: lngKey,
            radius,
            keyword
        });

        let enrichedPlaces: PlaceWithContext[] | null = await getCache<PlaceWithContext[]>("places_cache", googleCacheKey);

        if (enrichedPlaces) {
            console.log(`[Deep Search] 🟢 Cache HIT for ${googleCacheKey}`);
        } else {
            console.log(`[Deep Search] 🔴 Cache MISS for ${googleCacheKey} - Fetching from Google...`);

            const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY;
            if (!API_KEY) return NextResponse.json({ error: "Server Config Error" }, { status: 500 });

            // A. Broad Fetch
            const broadEndpoint = "https://places.googleapis.com/v1/places:searchNearby";
            const broadBody = {
                includedTypes: ["restaurant", "cafe", "bakery"],
                locationRestriction: {
                    circle: { center: { latitude: lat, longitude: lng }, radius: radius }
                },
                maxResultCount: 20
            };

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

            // Filter: Basic Hard Filters
            let candidates = broadData.places.filter((p: any) => (p.rating || 0) >= 3.5);
            candidates = candidates.slice(0, 20); // Keep top 20 relevant

            // B. Optimized Deep Fetch (Top 5 Only)
            // We split candidates into "Top Tier" (Deep Fetch) and "Standard Tier" (Basic Data)
            const topCandidates = candidates.slice(0, 5);
            const restCandidates = candidates.slice(5);

            // Fetch details for Top 5
            const deepPromises = topCandidates.map(async (p: any) => {
                const detailsEndpoint = `https://places.googleapis.com/v1/places/${p.id}`;
                const fields = "editorialSummary,reviews,servesVegetarianFood,websiteUri,photos";

                try {
                    const detailRes = await fetch(`${detailsEndpoint}?fields=${fields}&key=${API_KEY}`);
                    const detailData = await detailRes.json();

                    // Helper to safely get photo
                    const photoUrl = detailData.photos?.[0]?.name
                        ? `https://places.googleapis.com/v1/${detailData.photos[0].name}/media?maxHeightPx=400&maxWidthPx=400&key=${API_KEY}`
                        : null;

                    const primaryType = p.types?.[0] || 'restaurant';
                    const placeName = p.displayName?.text || p.name || "Place";
                    const fallbackImage = `https://placehold.co/600x400/orange/white?text=${encodeURIComponent(placeName)}`;

                    return {
                        place_id: p.id,
                        name: placeName,
                        types: p.types,
                        rating: p.rating,
                        user_ratings_total: p.userRatingCount,
                        price_level: p.priceLevel ? (p.priceLevel === "PRICE_LEVEL_EXPENSIVE" ? 3 : (p.priceLevel === "PRICE_LEVEL_MODERATE" ? 2 : 1)) : 1,
                        formatted_address: p.formattedAddress,
                        vicinity: p.formattedAddress,
                        geometry: {
                            location: { lat: p.location?.latitude || 0, lng: p.location?.longitude || 0 }
                        },
                        editorialSummary: detailData.editorialSummary?.text || detailData.editorialSummary,
                        reviews: detailData.reviews?.map((r: any) => ({
                            ...r,
                            text: r.text?.text || r.text
                        })) || [],
                        websiteUri: detailData.websiteUri,
                        servesVegetarianFood: detailData.servesVegetarianFood,
                        photoUrl: photoUrl || fallbackImage,
                        imageSrc: photoUrl || fallbackImage,
                        photos: detailData.photos?.map((photo: any) => ({
                            name: photo.name,
                            width: photo.widthPx,
                            height: photo.heightPx,
                            author_attributions: photo.authorAttributions,
                            url: `https://places.googleapis.com/v1/${photo.name}/media?maxHeightPx=800&maxWidthPx=800&key=${API_KEY}`
                        })) || [],
                        fallbackImageCategory: primaryType
                    };
                } catch (err) {
                    console.error(`Failed deep fetch for ${p.id}`, err);
                    return null; // Handle individual failure graciously
                }
            });

            // Map basic data for the rest (No deep fetch)
            const basicPlaces = restCandidates.map((p: any) => {
                const placeName = p.displayName?.text || p.name || "Place";
                const fallbackImage = `https://placehold.co/600x400/grey/white?text=${encodeURIComponent(placeName)}`;

                return {
                    place_id: p.id,
                    name: placeName,
                    types: p.types,
                    rating: p.rating,
                    user_ratings_total: p.userRatingCount,
                    price_level: p.priceLevel ? (p.priceLevel === "PRICE_LEVEL_EXPENSIVE" ? 3 : (p.priceLevel === "PRICE_LEVEL_MODERATE" ? 2 : 1)) : 1,
                    formatted_address: p.formattedAddress,
                    vicinity: p.formattedAddress,
                    geometry: {
                        location: { lat: p.location?.latitude || 0, lng: p.location?.longitude || 0 }
                    },
                    // Missing deep fields
                    editorialSummary: undefined,
                    reviews: [],
                    websiteUri: undefined,
                    servesVegetarianFood: undefined,
                    photoUrl: fallbackImage,
                    imageSrc: fallbackImage,
                    photos: [],
                    fallbackImageCategory: p.types?.[0] || 'restaurant'
                };
            });

            console.log(`[Deep Search] Fetching details for Top ${topCandidates.length} candidates...`);
            const richResults = (await Promise.all(deepPromises)).filter(p => p !== null) as PlaceWithContext[];

            // Combine Rich + Basic
            enrichedPlaces = [...richResults, ...basicPlaces];

            // Save to Cache (24h)
            if (enrichedPlaces.length > 0) {
                await setCache("places_cache", googleCacheKey, enrichedPlaces, 24 * 60 * 60 * 1000);
                console.log(`[Deep Search] Saved ${enrichedPlaces.length} places to cache`);
            }
        }

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

        // --- 6. Batch AI Scoring (Robust) ---
        let scoredPlaces = new Map();

        if (!usageStatus.limitReached && enrichedPlaces.length > 0) {
            console.log("[Deep Search] Scoring places with Gemini...");
            try {
                // Only score matching candidates (optimization)
                scoredPlaces = await scorePlacesWithDeepContext(enrichedPlaces, preferences);
                await incrementAIUsage(userId);
                console.log("[Deep Search] Scoring complete");
            } catch (aiError) {
                console.error("⚠️ [Deep Search] AI Scoring Failed (Self-Healing active):", aiError);
                // We proceed without scores (scoredPlaces remains empty)
                // This prevents the entire search from failing 500
            }
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
