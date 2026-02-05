import { getCache, setCache } from "@/lib/cache-utils";
import { Place } from "@/types/place";

const GOOGLE_PLACES_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

export async function getPlaceDetails(placeId: string): Promise<Place | null> {
    if (!placeId) throw new Error("Missing place_id");
    if (!GOOGLE_PLACES_API_KEY) throw new Error("Server Configuration Error: Missing Map Key");

    // 1. Cache Check
    const cacheKey = `v4_details_${placeId}`;
    const cachedData = await getCache<Place>("place_details_cache_v2", cacheKey);

    if (cachedData) {
        return cachedData;
    }

    console.log(`[PlaceService] Fetching V1 for ${placeId}`);

    // 2. V1 Fetch
    const url = `https://places.googleapis.com/v1/places/${placeId}`;
    const res = await fetch(url, {
        headers: {
            "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
            "X-Goog-FieldMask": "id,displayName,formattedAddress,location,photos,rating,userRatingCount,regularOpeningHours,reviews,editorialSummary,priceLevel,websiteUri,internationalPhoneNumber,types",
            "Accept-Language": "en"
        }
    });

    if (!res.ok) {
        const errText = await res.text();
        console.error(`[PlaceService] Google API Error (${res.status}):`, errText);
        throw new Error(`Google API Error: ${errText}`);
    }

    const data = await res.json();

    // 3. Map Response
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const photos = (data.photos || []).map((p: any) => ({
        height: p.heightPx,
        width: p.widthPx,
        name: p.name, // V1 name
        photo_reference: p.name, // Deprecated compat
        proxyPhotoUrl: `/api/images/proxy?id=${data.id}&ref=${encodeURIComponent(p.name)}&width=800`
    }));

    const mappedResult: Place = {
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reviews: (data.reviews || []).map((r: any) => ({
            author_name: r.authorAttribution?.displayName || "Anonymous",
            profile_photo_url: r.authorAttribution?.photoUri || "",
            rating: r.rating,
            relative_time_description: r.relativePublishTimeDescription,
            text: r.text?.text || "",
            time: r.publishTime ? new Date(r.publishTime).getTime() / 1000 : 0
        })),
        photos: photos,
        // Top-level convenience
        proxyPhotoUrl: photos.length > 0 ? photos[0].proxyPhotoUrl : undefined,
        imageSrc: photos.length > 0 ? photos[0].proxyPhotoUrl : "", // Deprecated compat
        description: data.editorialSummary?.text
    };

    // 4. Save to Cache
    await setCache("place_details_cache_v2", cacheKey, mappedResult, 24 * 60 * 60 * 1000);

    return mappedResult;
}

function mapPriceLevel(level: string): number | undefined {
    if (!level) return undefined;
    switch (level) {
        case "PRICE_LEVEL_FREE": return 0;
        case "PRICE_LEVEL_INEXPENSIVE": return 1;
        case "PRICE_LEVEL_MODERATE": return 2;
        case "PRICE_LEVEL_EXPENSIVE": return 3;
        case "PRICE_LEVEL_VERY_EXPENSIVE": return 4;
        default: return undefined;
    }
}
