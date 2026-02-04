import { NextRequest, NextResponse } from "next/server";
import { getCache, setCache } from "@/lib/cache-utils";

const GOOGLE_PLACES_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

// V1 Field Mask
const DETAILS_FIELD_MASK = [
    "id",
    "displayName",
    "formattedAddress",
    "location",
    "photos",
    "rating",
    "userRatingCount",
    "regularOpeningHours",
    "reviews",
    "editorialSummary",
    "priceLevel",
    "websiteUri",
    "internationalPhoneNumber",
    "types"
].map(field => `places.${field}`).join(",");

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const placeId = searchParams.get("place_id");
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY; // Use Public key (restricted by HTTP Referrer in PROD)

    if (!placeId) {
        return NextResponse.json({ error: "Missing place_id parameter" }, { status: 400 });
    }

    if (!apiKey) {
        console.error("[Details API] Missing API Key");
        return NextResponse.json({ error: "Server Configuration Error" }, { status: 500 });
    }

    // --- 1. Cache Check ---
    const cacheKey = `v4_details_${placeId}`; // Bump version to invalidate old structure
    const cachedData = await getCache<any>("place_details_cache_v2", cacheKey);

    if (cachedData) {
        return NextResponse.json({ ...cachedData, source: "cache" });
    }

    try {
        console.log(`[Details API] Fetching V1 for ${placeId}`);
        // --- 2. V1 Fetch (Native) ---
        // Docs: https://developers.google.com/maps/documentation/places/web-service/place-details
        const url = `https://places.googleapis.com/v1/places/${placeId}`;

        const res = await fetch(url, {
            headers: {
                "X-Goog-Api-Key": apiKey,
                "X-Goog-FieldMask": "id,displayName,formattedAddress,location,photos,rating,userRatingCount,regularOpeningHours,reviews,editorialSummary,priceLevel,websiteUri,internationalPhoneNumber,types",
                "Accept-Language": "en"
            }
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error(`[Details API] Google V1 Error (${res.status}):`, errText);
            // Pass through the error status for better debugging
            return NextResponse.json({ error: `Google API Error: ${errText}` }, { status: res.status });
        }

        const data = await res.json();

        // --- 3. Response Mapping (Strict) ---
        // We create a cleaner object for the frontend
        const mappedResult = {
            place_id: data.id,
            name: data.displayName?.text || "Unknown Place",
            formatted_address: data.formattedAddress,
            formatted_phone_number: data.internationalPhoneNumber,
            website: data.websiteUri,
            rating: data.rating,
            user_ratings_total: data.userRatingCount,
            price_level: mapPriceLevel(data.priceLevel),
            types: data.types || [],
            geometry: {
                location: {
                    lat: data.location?.latitude,
                    lng: data.location?.longitude
                }
            },
            opening_hours: {
                open_now: data.regularOpeningHours?.openNow || false,
                weekday_text: data.regularOpeningHours?.weekdayDescriptions || []
            },
            reviews: (data.reviews || []).map((r: any) => ({
                author_name: r.authorAttribution?.displayName || "Anonymous",
                profile_photo_url: r.authorAttribution?.photoUri || "",
                rating: r.rating,
                relative_time_description: r.relativePublishTimeDescription,
                text: r.text?.text || "",
                time: r.publishTime ? new Date(r.publishTime).getTime() / 1000 : 0
            })),
            // CRITICAL: Proxy Photo Mapping
            photos: (data.photos || []).map((p: any) => ({
                height: p.heightPx,
                width: p.widthPx,
                photo_reference: p.name, // "places/PLACE_ID/photos/PHOTO_ID"
                // New Proxy URL Pattern
                url: `/api/images/proxy?id=${data.id}&ref=${encodeURIComponent(p.name)}&width=800`
            })),
            description: data.editorialSummary?.text
        };

        // --- 4. Cache Save ---
        await setCache("place_details_cache_v2", cacheKey, mappedResult, 24 * 60 * 60 * 1000);

        return NextResponse.json(mappedResult);

    } catch (error: any) {
        console.error("[Details API] Exception:", error);
        return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
    }
}

function mapPriceLevel(level: string): number | null {
    if (!level) return null;
    switch (level) {
        case "PRICE_LEVEL_FREE": return 0;
        case "PRICE_LEVEL_INEXPENSIVE": return 1;
        case "PRICE_LEVEL_MODERATE": return 2;
        case "PRICE_LEVEL_EXPENSIVE": return 3;
        case "PRICE_LEVEL_VERY_EXPENSIVE": return 4;
        default: return null;
    }
}
