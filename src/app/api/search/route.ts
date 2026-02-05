import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";
import { getCache, setCache, createCacheKey } from "@/lib/cache-utils";
import { checkUserLimit, reserveUserCredit } from "@/lib/user-limits";
import { scorePlacesWithDeepContext } from "@/lib/gemini"; // Preserving AI Logic

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
        // --- 0. Panic Room: Global Crash Prevention ---
        // Ensure we NEVER crash with HTML.
        const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
        const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

        if (!GOOGLE_API_KEY) throw new Error("MISSING ENV VAR: NEXT_PUBLIC_GOOGLE_MAPS_KEY");
        if (!FIREBASE_PROJECT_ID) throw new Error("MISSING ENV VAR: NEXT_PUBLIC_FIREBASE_PROJECT_ID");

        // --- 1. Validation & Config ---
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
                const decodedToken = await getAdminAuth().verifyIdToken(token);
                userId = decodedToken.uid;
            } catch {
                console.warn("[Search API] Invalid Token");
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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cachedData = await getCache<any>(cacheCollection, cacheKey);

        if (cachedData) {
            // Cache hit! Return data with CURRENT user credits (no deduction).
            let currentStatus = null;
            if (userId) {
                currentStatus = await checkUserLimit(userId);
            }
            return NextResponse.json({
                ...cachedData,
                creditsRemaining: currentStatus?.remaining ?? 5,
                mode: currentStatus?.tier ?? 'free',
                source: "cache"
            });
        }

        // --- 4. Reserve Credit (Transaction) ---
        // On Cache MISS, we strictly reserve credit via transaction BEFORE fetching.
        let reservedStatus: { authorized: boolean; tier: 'free' | 'premium'; remaining: number } | null = null;

        if (userId) {
            reservedStatus = await reserveUserCredit(userId);

            if (!reservedStatus.authorized) {
                return NextResponse.json({
                    error: "Monthly limit reached",
                    code: "LIMIT_REACHED",
                    mode: 'free',
                    tier: 'free'
                }, { status: 402 });
            }
        }

        // --- 4. Fetch (Costly Operation) ---
        console.log(`[Search API] MISS ${cacheKey}. Fetching Google V1.`);

        let endpoint = "https://places.googleapis.com/v1/places:searchNearby";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const requestBody: any = {
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        if (userId && rawPlaces.length > 0) {
            try {
                const scoresMap = await scorePlacesWithDeepContext(rawPlaces, {}, keyword);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                finalResults = rawPlaces.map((p: any) => ({
                    ...p,
                    ai_score: scoresMap.get(p.place_id),
                    isGeneric: !scoresMap.get(p.place_id)
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                })).sort((a: any, b: any) => (b.ai_score?.matchScore || 0) - (a.ai_score?.matchScore || 0));
            } catch (e) {
                console.warn("AI Scoring failed, returning raw results", e);
            }
        }

        // --- 7. Respond with Reserved Status ---
        const finalCredits = reservedStatus?.remaining ?? 0;
        const finalMode = reservedStatus?.tier ?? 'free';
        // Note: Credits were already decremented in step 4 via reserveUserCredit transaction.

        const responseData = {
            results: finalResults,
            mode: finalMode,
            creditsRemaining: finalCredits,
            refreshNeeded: true // Signal UI to update
        };

        // --- 8. Save Cache (Async) ---
        if (userId) {
            await setCache(cacheCollection, cacheKey, responseData, 24 * 60 * 60 * 1000, userId);
        }

        return NextResponse.json(responseData);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error("🔥 CRITICAL SEARCH ERROR:", error);
        return NextResponse.json({
            error: error.message || "Internal Server Error",
            code: "CRITICAL_FAILURE",
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
