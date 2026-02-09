import { getCache, setCache } from "@/lib/cache-utils";
import { Place } from "@/types/place";

const GOOGLE_PLACES_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

export async function getPlaceDetails(placeId: string): Promise<Place | null> {
    if (!placeId) throw new Error("Missing place_id");

    let claimData: Partial<Place> | null = null;

    // 0. Claim Priority Check (Strict)
    // We check Firestore first. If claimed, we serve that data and SKIP Google API.
    try {
        const { getAdminDb } = await import("@/lib/firebase-admin");
        const doc = await getAdminDb().collection("restaurants").doc(placeId).get();

        if (doc.exists) {
            const data = doc.data();
            // If claimed, capture the claim data
            if (data?.isClaimed) {
                // Prepare claim data to merge later if needed
                claimData = {
                    isClaimed: true,
                    menu: data.menu,
                    tableConfig: data.tableConfig,
                    customPhotos: data.images?.owner
                };

                // If we also have full details, we can return immediately (Fast Path)
                if (data.details && data.details.name) {
                    // console.log(`[PlaceService] 🟢 Served from Strict Claim: ${placeId}`);

                    // Map Firestore Restaurant -> Place
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const photos = (data.images?.owner || []).map((img: any) => ({
                        height: 0,
                        width: 0,
                        name: "owner_upload",
                        photo_reference: "owner_upload",
                        proxyPhotoUrl: img.url,
                        url: img.url
                    }));

                    // Fallback to Google photos if owner hasn't uploaded any
                    if (photos.length === 0 && data.images?.google) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        data.images.google.forEach((img: any) => {
                            photos.push({
                                height: img.height,
                                width: img.width,
                                name: img.photoReference,
                                photo_reference: img.photoReference,
                                proxyPhotoUrl: img.cachedUrl || `/api/images/proxy?id=${placeId}&ref=${img.photoReference}`
                            });
                        });
                    }

                    return {
                        place_id: placeId,
                        name: data.details.name,
                        formatted_address: data.details.address,
                        formatted_phone_number: data.details.phoneNumber,
                        website: data.details.website,
                        rating: data.details.rating,
                        user_ratings_total: data.details.userRatingCount,
                        price_level: data.details.priceLevel,
                        types: data.details.types || [],
                        geometry: data.details.geometry,
                        opening_hours: {
                            open_now: false, // Calc logic needed if strictly offline, or use data.details.openingHours
                            weekday_text: data.details.openingHours?.weekdayDescriptions || []
                        },
                        reviews: data.details.reviews || [], // Use cached reviews
                        photos: photos,
                        proxyPhotoUrl: photos.length > 0 ? photos[0].proxyPhotoUrl : undefined,
                        imageSrc: photos.length > 0 ? photos[0].proxyPhotoUrl : "",
                        description: data.details.editorialSummary || data.details.description,

                        // Managed Fields
                        ...claimData
                    } as Place;
                } else {
                    console.warn(`[PlaceService] ⚠️ Claimed place ${placeId} missing details in Firestore. Falling back to Google.`);
                }
            }
        }
    } catch (err) {
        console.error("[PlaceService] Firestore check failed:", err);
        // Continue to Google fallback, but we might have missed claimData if the fetch itself failed.
        // If the fetch failed, claimData is null, so we treat as unclaimed.
    }

    if (!GOOGLE_PLACES_API_KEY) throw new Error("Server Configuration Error: Missing Map Key");

    // 1. Cache Check
    const cacheKey = `v4_details_${placeId}`;
    const cachedData = await getCache<Place>("place_details_cache_v2", cacheKey);

    if (cachedData) {
        // Merge claim data if we found it
        if (claimData) {
            return { ...cachedData, ...claimData };
        }
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

    // 3b. Self-healing / Backfilling details to Firestore if it was claimed but missing details
    if (claimData) {
        try {
            // We have a claimed place with missing details. Let's fix that record.
            const { getAdminDb } = await import("@/lib/firebase-admin");
            await getAdminDb().collection("restaurants").doc(placeId).set({
                details: {
                    name: mappedResult.name,
                    address: mappedResult.formatted_address,
                    phoneNumber: mappedResult.formatted_phone_number,
                    website: mappedResult.website,
                    rating: mappedResult.rating,
                    userRatingCount: mappedResult.user_ratings_total,
                    priceLevel: mappedResult.price_level,
                    types: mappedResult.types,
                    geometry: mappedResult.geometry,
                    // We skip photos array for now to avoid complexity, or deep copy it
                },
                updatedAt: new Date().toISOString()
            }, { merge: true });
            console.log(`[PlaceService] 🩹 Self-healed missing details for claimed place ${placeId}`);
        } catch (healErr) {
            console.error("[PlaceService] Failed to self-heal claimed place:", healErr);
        }
    }

    // 4. Save to Cache
    await setCache("place_details_cache_v2", cacheKey, mappedResult, 24 * 60 * 60 * 1000);

    // Merge claim data before returning
    if (claimData) {
        return { ...mappedResult, ...claimData };
    }

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
