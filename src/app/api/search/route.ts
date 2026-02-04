import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { getCache, setCache, createCacheKey } from "@/lib/cache-utils";
import { checkUserLimit, incrementUserUsage } from "@/lib/user-limits";
import { scorePlacesWithDeepContext } from "@/lib/gemini"; // Preserving AI Logic

const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

// Strict Field Mask (No reviews/opening hours for list view)
const LIST_FIELD_MASK = [
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.location",
    "places.photos",
    "places.rating",
    "places.userRatingCount",
    "places.priceLevel",
    "places.types"
].join(",");

export async function GET(request: NextRequest) {
    try {
        // --- 1. Validation & Config ---
        if (!GOOGLE_API_KEY) {
            return NextResponse.json({ error: "Server Configuration Error" }, { status: 500 });
        }

        const { searchParams } = new URL(request.url);
        const lat = parseFloat(searchParams.get("lat") || "0");
        const lng = parseFloat(searchParams.get("lng") || "0");
        const radius = parseFloat(searchParams.get("radius") || "5000");
        const keyword = searchParams.get("keyword") || "";
        const cityId = searchParams.get("cityId");

        // --- 2. Gatekeeper: Authentication & Billing ---
        let userId: string | null = null;
        const authHeader = request.headers.get("Authorization");

        if (authHeader?.startsWith("Bearer ")) {
            try {
                const token = authHeader.split("Bearer ")[1];
                const decodedToken = await adminAuth.verifyIdToken(token);
                userId = decodedToken.uid;
            } catch (e) {
                console.warn("[Search API] Invalid Token");
            }
        }

        // Check Limits BEFORE fetching anything
        let usageStatus = null;
        if (userId) {
            usageStatus = await checkUserLimit(userId);
            if (usageStatus.limitReached) {
                return NextResponse.json({
                    error: "Monthly limit reached",
                    code: "LIMIT_REACHED",
                    mode: 'free',
                    tier: 'free'
                }, { status: 402 });
            }
        }

        // --- 3. Cache Strategy ---
        // Bonus: Cache HITS do NOT consume quota
        let cacheKey: string;
        let cacheCollection = "places_search_cache_v2";

        if (cityId) {
            cacheKey = `v2:${cityId}:${keyword || 'all'}`.toLowerCase();
            cacheCollection = "places_city_cache_v2";
        } else {
            cacheKey = `v2:${createCacheKey({ lat, lng, radius, keyword })}`;
        }

        const cachedData = await getCache<any>(cacheCollection, cacheKey);

        if (cachedData) {
            return NextResponse.json({
                ...cachedData,
                creditsRemaining: usageStatus?.remaining ?? 5,
                mode: usageStatus?.tier ?? 'free',
                source: "cache"
            });
        }

        // --- 4. Fetch (Costly Operation) ---
        console.log(`[Search API] MISS ${cacheKey}. Fetching Google V1.`);

        let endpoint = "https://places.googleapis.com/v1/places:searchNearby";
        let requestBody: any = {
            maxResultCount: 20
        };

        if (keyword) {
            endpoint = "https://places.googleapis.com/v1/places:searchText";
            requestBody.textQuery = keyword;
            if (lat !== 0 && lng !== 0) {
                requestBody.locationBias = {
                    circle: { center: { latitude: lat, longitude: lng }, radius }
                };
            }
        } else {
            requestBody.includedTypes = ["restaurant"];
            requestBody.locationRestriction = {
                circle: { center: { latitude: lat, longitude: lng }, radius }
            };
        }

        const googleRes = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": GOOGLE_API_KEY,
                "X-Goog-FieldMask": LIST_FIELD_MASK
            },
            body: JSON.stringify(requestBody)
        });

        if (!googleRes.ok) {
            throw new Error(`Google V1 Error: ${googleRes.status} ${await googleRes.text()}`);
        }

        const googleData = await googleRes.json();

        // --- 5. Transform (Proxy URLs Only) ---
        const rawPlaces = (googleData.places || []).map((p: any) => {
            const photoRef = p.photos?.[0]?.name;
            const placeId = p.id;

            // Generate Proxy URL immediately
            const proxyPhotoUrl = photoRef
                ? `/api/images/proxy?ref=${encodeURIComponent(photoRef)}&id=${placeId}`
                : null; // Frontend handles null

            return {
                place_id: placeId,
                name: p.displayName?.text || "Unknown",
                formatted_address: p.formattedAddress,
                geometry: {
                    location: {
                        lat: p.location?.latitude || 0,
                        lng: p.location?.longitude || 0
                    }
                },
                rating: p.rating,
                user_ratings_total: p.userRatingCount,
                types: p.types,
                price_level: mapPriceLevel(p.priceLevel),
                imageSrc: proxyPhotoUrl, // Strict Proxy
                proxyPhotoUrl: proxyPhotoUrl
            };
        });

        // --- 6. AI Scoring (Optional Enhancement) ---
        let finalResults = rawPlaces;
        // Only run AI if user is authenticated and we just spent a credit? 
        // Or if they are valid.
        // Let's run it if we have results.
        if (userId && rawPlaces.length > 0) {
            try {
                // We don't need a separate credit for AI if the Search itself is the credit.
                // But we can pass context.
                // NOTE: We do NOT increment usages *again* here if we are bundling it.
                // The original code passed 'rawPlaces' to Gemini.
                const scoresMap = await scorePlacesWithDeepContext(rawPlaces, {}, keyword);
                finalResults = rawPlaces.map((p: any) => ({
                    ...p,
                    ai_score: scoresMap.get(p.place_id),
                    isGeneric: !scoresMap.get(p.place_id)
                })).sort((a: any, b: any) => (b.ai_score?.matchScore || 0) - (a.ai_score?.matchScore || 0));
            } catch (e) {
                console.warn("AI Scoring failed, returning raw results", e);
            }
        }

        const responseData = {
            results: finalResults,
            mode: usageStatus?.tier ?? 'free',
            creditsRemaining: usageStatus ? (usageStatus.remaining - 1) : 0, // Predicted logic
        };

        // --- 7. Save Cache & CHARGE USER ---
        if (userId) {
            await Promise.all([
                setCache(cacheCollection, cacheKey, responseData, 24 * 60 * 60 * 1000, userId),
                incrementUserUsage(userId) // The Bill
            ]);
            // Adjust local variable for accurate response
            if (responseData.creditsRemaining !== Infinity) {
                // It's already calculated as remaining - 1 above.
            }
        }

        return NextResponse.json(responseData);

    } catch (error: any) {
        console.error("[Search API] Critical Error:", error);
        return NextResponse.json({
            error: "Internal Server Error",
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }, { status: 500 });
    }
}

function mapPriceLevel(level: string): number | null {
    switch (level) {
        case "PRICE_LEVEL_FREE": return 0;
        case "PRICE_LEVEL_INEXPENSIVE": return 1;
        case "PRICE_LEVEL_MODERATE": return 2;
        case "PRICE_LEVEL_EXPENSIVE": return 3;
        case "PRICE_LEVEL_VERY_EXPENSIVE": return 4;
        default: return null;
    }
}
