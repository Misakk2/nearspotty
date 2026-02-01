import { NextRequest, NextResponse } from "next/server";
import { getCache, setCache, createCacheKey } from "@/lib/cache-utils";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { checkAIUsage, incrementAIUsage } from "@/lib/ai-usage";

/**
 * Nearby Places API Route with Authentication and Subscription Limits
 * 
 * - Requires Firebase Auth token in Authorization header
 * - Checks user's AI usage against subscription limits
 * - Returns 401 for unauthenticated requests
 * - Returns 402 when free tier limit reached
 * - USES NEW GOOGLE PLACES API (v1) for field masking optimization & cost reduction
 */
export async function GET(request: NextRequest) {
    // --- 1. Authenticate User ---
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return NextResponse.json(
            { error: "Authentication required", code: "UNAUTHORIZED" },
            { status: 401 }
        );
    }

    const token = authHeader.split("Bearer ")[1];
    let userId: string;
    let decodedToken;

    try {
        decodedToken = await adminAuth.verifyIdToken(token);
        userId = decodedToken.uid;
    } catch (error) {
        console.error("[places/nearby] Token verification failed:", error);
        return NextResponse.json(
            { error: "Invalid or expired token", code: "INVALID_TOKEN", details: error instanceof Error ? error.message : "Unknown error" },
            { status: 401 }
        );
    }

    // --- 2. Check Subscription Limits & Initialize User if Missing ---
    let usageStatus;
    try {
        usageStatus = await checkAIUsage(userId);
    } catch (error) {
        console.log("User document likely missing, initializing...", error);
        // Initialize user doc if missing (Fix for 401/500 errors on new users)
        await adminAuth.updateUser(userId, { emailVerified: true }).catch(() => { });
        await adminDb.collection("users").doc(userId).set({
            email: decodedToken.email || "",
            createdAt: new Date().toISOString(),
            tier: "free",
            plan: "free",
            subscription: {
                status: "active",
                tier: "free",
                cancel_at_period_end: false,
                current_period_end: null
            },
            aiUsage: { count: 0, resetDate: new Date().toISOString() }
        }, { merge: true });

        // Retry check
        usageStatus = await checkAIUsage(userId);
    }

    if (usageStatus.limitReached) {
        return NextResponse.json(
            {
                error: "Monthly search limit reached",
                code: "LIMIT_REACHED",
                tier: usageStatus.tier,
                count: usageStatus.count,
                remaining: 0,
                upgradeUrl: "/pricing"
            },
            { status: 402 }
        );
    }

    // --- 3. Parse Request Parameters ---
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get("lat") || "0");
    const lng = parseFloat(searchParams.get("lng") || "0");
    const radius = parseFloat(searchParams.get("radius") || "5000");
    const type = searchParams.get("type") || "restaurant";
    const keyword = searchParams.get("keyword") || "";
    const cityId = searchParams.get("cityId");

    const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY;

    if (!API_KEY) {
        console.error("Missing NEXT_PUBLIC_GOOGLE_PLACES_KEY");
        return NextResponse.json({ error: "Server Configuration Error: Missing Maps Key" }, { status: 500 });
    }

    // --- 4. Check Cache (Priority: City ID + Category) ---
    const categoryKey = keyword || type;
    let cacheKey: string;
    let cacheCollection = "places_nearby_cache"; // Default legacy

    if (cityId) {
        cacheKey = `${cityId}:${categoryKey}`.toLowerCase();
        cacheCollection = "places_cache"; // Global cache
        // console.log(`[Cache] Checking global cache: ${cacheKey}`);
    } else {
        cacheKey = createCacheKey({ lat, lng, radius, type, keyword });
    }

    const cachedData = await getCache(cacheCollection, cacheKey);

    if (cachedData) {
        // console.log(`[Cache] Hit for ${cacheKey}`);
        // Log search history (async, fire and forget)
        adminDb.collection("users").doc(userId).collection("search_history").add({
            query: keyword || type,
            location: { lat, lng, cityId },
            timestamp: new Date().toISOString(),
            source: "cache"
        });

        return NextResponse.json({
            // @ts-ignore - cachedData is unknown
            ...cachedData,
            usage: {
                remaining: usageStatus.remaining,
                tier: usageStatus.tier
            }
        });
    }

    // --- 5. Build Google Places API Request (New API) ---
    // Decision: searchText (if keyword) or searchNearby (if location only)
    const isSearchText = !!keyword;

    // API v1 Endpoints
    const endpoint = isSearchText
        ? "https://places.googleapis.com/v1/places:searchText"
        : "https://places.googleapis.com/v1/places:searchNearby";

    // Request Body construction
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requestBody: any = {};

    if (isSearchText) {
        requestBody.textQuery = keyword;
        // Bias towards location if available
        if (lat && lng) {
            requestBody.locationBias = {
                circle: {
                    center: { latitude: lat, longitude: lng },
                    radius: radius
                }
            };
        }
    } else {
        // searchNearby requires includedTypes
        requestBody.includedTypes = [type];
        requestBody.locationRestriction = {
            circle: {
                center: { latitude: lat, longitude: lng },
                radius: radius
            }
        };
        requestBody.maxResultCount = 20;
    }

    // Field Mask: essential fields only to save bandwidth/cost
    const fieldMask = [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.location",
        "places.rating",
        "places.userRatingCount",
        "places.priceLevel",
        "places.types",
        "places.photos"
    ].join(",");

    // --- 6. Fetch from Google Places API ---
    try {
        const res = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": API_KEY,
                "X-Goog-FieldMask": fieldMask
            },
            body: JSON.stringify(requestBody)
        });

        const data = await res.json();

        if (!res.ok) {
            console.error(`Google Places API Error (${res.status}):`, JSON.stringify(data));
            return NextResponse.json({ error: "Failed to fetch places from Google", details: data.error }, { status: 500 });
        }

        // Map New API response to legacy 'Place' interface
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const places = (data.places || []).map((p: any) => ({
            place_id: p.id,
            name: p.displayName?.text || "Unknown Place",
            vicinity: p.formattedAddress, // Fallback for legacy 'vicinity'
            formatted_address: p.formattedAddress,
            rating: p.rating,
            user_ratings_total: p.userRatingCount,
            geometry: {
                location: {
                    lat: p.location.latitude,
                    lng: p.location.longitude
                }
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            photos: p.photos?.map((photo: any) => ({
                photo_reference: photo.name, // In v1, photo.name is the resource name (places/ID/photos/ID)
                height: photo.heightPx,
                width: photo.widthPx
            })),
            types: p.types,
            price_level: mapPriceLevel(p.priceLevel)
        }));

        const resultData = { results: places, status: "OK" };

        // Cache successful response (24h)
        if (places.length > 0) {
            await setCache(cacheCollection, cacheKey, resultData);
            await incrementAIUsage(userId);

            // Log Search History
            adminDb.collection("users").doc(userId).collection("search_history").add({
                query: keyword || type,
                location: { lat, lng, cityId },
                timestamp: new Date().toISOString(),
                source: "google_api_v1"
            });
        }

        return NextResponse.json({
            ...resultData,
            usage: {
                remaining: Math.max(0, usageStatus.remaining - 1),
                tier: usageStatus.tier
            }
        });

    } catch (error) {
        console.error("API Route Exception:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

// Helper to map ENUM price levels to 0-4
function mapPriceLevel(level: string): number | undefined {
    switch (level) {
        case "PRICE_LEVEL_FREE": return 0;
        case "PRICE_LEVEL_INEXPENSIVE": return 1;
        case "PRICE_LEVEL_MODERATE": return 2;
        case "PRICE_LEVEL_EXPENSIVE": return 3;
        case "PRICE_LEVEL_VERY_EXPENSIVE": return 4;
        default: return undefined;
    }
}
