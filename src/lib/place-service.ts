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
                // Check for menu subcollection first
                const menuSnap = await getAdminDb().collection("restaurants").doc(placeId).collection("menu").get();
                let menuItems = data.menu?.items || [];

                if (!menuSnap.empty) {
                    menuItems = menuSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as { id: string; name: string; price: number; category: string }));
                }

                // Prepare claim data to merge later if needed
                claimData = {
                    isClaimed: true,
                    menu: { items: menuItems },
                    tableConfig: data.tableConfig,
                    customPhotos: data.customPhotos || data.images?.owner,
                    // Map root fields that we save in RestaurantEditor
                    description: data.description,
                    website: data.website,
                    formatted_phone_number: data.formatted_phone_number,
                    price_level: data.price_level,
                    cuisineTypes: data.cuisineTypes,
                    openingHoursSpecification: data.openingHoursSpecification
                };

                // If we also have full details, we can return immediately (Fast Path)
                if (data.details && data.details.name && data.images) {
                    // console.log(`[PlaceService] 🟢 Served from Strict Claim: ${placeId}`);

                    // Merge Photos: Owner photos first, then Google photos
                    const ownerPhotos = (data.customPhotos || data.images?.owner || []).map((img: { url: string }) => ({
                        height: 0,
                        width: 0,
                        name: "owner_upload",
                        photo_reference: "owner_upload",
                        proxyPhotoUrl: img.url,
                        url: img.url
                    }));

                    const googlePhotos = (data.images?.google || []).map((img: { height: number; width: number; photoReference: string; cachedUrl?: string }) => ({
                        height: img.height,
                        width: img.width,
                        name: img.photoReference,
                        photo_reference: img.photoReference,
                        proxyPhotoUrl: img.cachedUrl || `/api/images/proxy?id=${placeId}&ref=${img.photoReference}`
                    }));

                    const photos = [...ownerPhotos, ...googlePhotos];

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
                            open_now: data.details.openingHours?.openNow || false,
                            weekday_text: data.details.openingHours?.weekdayDescriptions || []
                        },
                        openingHoursSpecification: data.openingHoursSpecification || data.details.openingHoursSpecification,
                        reviews: data.details.reviews || [], // Use cached reviews
                        photos: photos,
                        proxyPhotoUrl: photos.length > 0 ? photos[0].proxyPhotoUrl : undefined,
                        imageSrc: photos.length > 0 ? photos[0].proxyPhotoUrl : "",
                        description: data.description || data.details.editorialSummary || data.details.description,

                        // Managed Fields
                        ...claimData
                    } as Place;
                } else {
                    console.warn(`[PlaceService] ⚠️ Claimed place ${placeId} missing details or images in Firestore. Falling back to Google.`);
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
        // For claimed restaurants, we might want to skip cache or use a very short TTL
        // But for now, we'll just merge claimData. 
        // NOTE: If owner just updated their data, we should probably have a way to invalidate this.
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
    const photos = (data.photos || []).map((p: { heightPx: number; widthPx: number; name: string }) => ({
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
        openingHoursSpecification: mapOpeningHoursToSpec(data.regularOpeningHours?.periods),
        reviews: (data.reviews || []).map((r: { authorAttribution?: { displayName?: string; photoUri?: string }; rating: number; relativePublishTimeDescription: string; text?: { text: string }; publishTime?: string }) => ({
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

            // Extract google photos for storage
            const googlePhotos = photos.map((p: { height: number; width: number; name?: string; photo_reference?: string }) => ({
                height: p.height,
                width: p.width,
                photoReference: p.name || p.photo_reference,
            }));

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
                images: {
                    google: googlePhotos
                },
                updatedAt: new Date().toISOString(),
                openingHoursSpecification: mappedResult.openingHoursSpecification
            }, { merge: true });
            console.log(`[PlaceService] 🩹 Self-healed missing details/images for claimed place ${placeId}`);
        } catch (healErr) {
            console.error("[PlaceService] Failed to self-heal claimed place:", healErr);
        }
    }

    // 4. Save to Cache
    // TTL: 24h for normal places, 5m for claimed places to ensure owner changes are visible
    const ttl = claimData?.isClaimed ? 5 * 60 * 1000 : 24 * 60 * 60 * 1000;
    await setCache("place_details_cache_v2", cacheKey, mappedResult, ttl);

    // Merge claim data before returning
    if (claimData) {
        // Merger Photos: Owner photos first, then Google photos
        const ownerPhotos = (claimData.customPhotos || []).map((img: { url: string }) => ({
            height: 0,
            width: 0,
            name: "owner_upload",
            photo_reference: "owner_upload",
            proxyPhotoUrl: img.url,
            url: img.url
        }));

        const mergedPhotos = [...ownerPhotos, ...(mappedResult.photos || [])];

        return {
            ...mappedResult,
            ...claimData,
            photos: mergedPhotos,
            proxyPhotoUrl: mergedPhotos.length > 0 ? mergedPhotos[0].proxyPhotoUrl : mappedResult.proxyPhotoUrl,
            imageSrc: mergedPhotos.length > 0 ? mergedPhotos[0].proxyPhotoUrl || "" : mappedResult.imageSrc || ""
        };
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

function mapOpeningHoursToSpec(periods: { open: { hour: number; minute: number; day: number }; close?: { hour: number; minute: number; day: number } }[]): { dayOfWeek: string[]; opens: string; closes: string; }[] | undefined {
    if (!periods || !Array.isArray(periods)) return undefined;

    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    return periods.map(p => {
        const openTime = p.open ? `${String(p.open.hour).padStart(2, '0')}:${String(p.open.minute).padStart(2, '0')}` : "00:00";
        const closeTime = p.close ? `${String(p.close.hour).padStart(2, '0')}:${String(p.close.minute).padStart(2, '0')}` : "23:59";

        return {
            dayOfWeek: [days[p.open.day]],
            opens: openTime,
            closes: closeTime
        };
    });
}
