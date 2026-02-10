/**
 * Shared cache helper functions for place data enrichment.
 * Eliminates duplicate override logic across API routes.
 */

import { getAdminDb } from "@/lib/firebase-admin";
import { Place } from "@/types/place";

/**
 * Merges claimed restaurant data from Firestore into Google Places results.
 * 
 * For each place, checks if it's claimed in Firestore and overrides:
 * - name (from owner's data)
 * - formatted_address (from owner's data)
 * - price_level (mapped from avgCheck)
 * - types (merges cuisineTypes with Google types)
 * 
 * @param places - Array of Place objects from Google Places API
 * @returns Merged array with claimed restaurant overrides applied
 * 
 * @example
 * const googleResults = await fetchFromGoogleAPI();
 * const enriched = await mergeClaimedRestaurantData(googleResults);
 */
export async function mergeClaimedRestaurantData(places: Place[]): Promise<Place[]> {
    if (places.length === 0) {
        return places;
    }

    const results = [...places];

    try {
        const placeIds = results.map(p => p.place_id);
        const db = getAdminDb();

        // Parallel fetch of all claimed restaurant documents
        const claimedDocs = await Promise.all(
            placeIds.map(id => db.collection("restaurants").doc(id).get())
        );

        claimedDocs.forEach(doc => {
            if (doc.exists) {
                const data = doc.data();
                if (data?.isClaimed) {
                    const index = results.findIndex(p => p.place_id === doc.id);
                    if (index !== -1) {
                        const place = results[index];

                        // Merge claimed restaurant data with priority over Google data
                        results[index] = {
                            ...place,
                            name: data.name || place.name,
                            formatted_address: data.address || place.formatted_address,
                            // Map average check to price level (1-4 scale)
                            price_level: data.avgCheck
                                ? (data.avgCheck > 50 ? 4 : data.avgCheck > 30 ? 3 : data.avgCheck > 15 ? 2 : 1)
                                : place.price_level,
                            // Prepend custom cuisine types while keeping Google types
                            types: data.cuisineTypes && data.cuisineTypes.length > 0
                                ? [...data.cuisineTypes, ...place.types]
                                : place.types
                        };
                    }
                }
            }
        });

    } catch (err) {
        console.error("[cache-helpers] Failed to merge claimed restaurant data:", err);
        // Return original places on error - non-blocking
    }

    return results;
}

/**
 * Enriches a Place object with additional claimed restaurant data.
 * Used for single place detail views.
 * 
 * @param place - Place object to enrich
 * @returns Enriched Place with owner data merged
 */
export async function enrichPlaceWithClaimedData(place: Place): Promise<Place> {
    const enriched = await mergeClaimedRestaurantData([place]);
    return enriched[0] || place;
}

/**
 * Batch fetch and enrich multiple places by their IDs.
 * Replaces getEnrichedRestaurants from restaurant-cache.ts.
 * Uses getPlaceDetails from place-service.ts for unified caching.
 * 
 * @param placeIds - Array of Google Place IDs to fetch
 * @returns Array of enriched Place objects
 */
export async function getEnrichedPlaces(placeIds: string[]): Promise<Place[]> {
    if (placeIds.length === 0) return [];

    console.log(`[cache-helpers] Enriching ${placeIds.length} places...`);

    // Import dynamically to avoid circular dependencies
    const { getPlaceDetails } = await import("@/lib/place-service");

    // Fetch all places in parallel
    const placePromises = placeIds.map(async (id) => {
        try {
            const place = await getPlaceDetails(id);
            return place;
        } catch (error) {
            console.error(`[cache-helpers] Failed to fetch place ${id}:`, error);
            return null;
        }
    });

    const results = await Promise.all(placePromises);

    // Filter out nulls and preserve order
    return results.filter((p): p is Place => p !== null);
}

/**
 * Resolves the best image URL for a Place using priority logic:
 * 1. Custom photos from claimed owners (if claimed)
 * 2. proxyPhotoUrl from Place photos array
 * 3. imageSrc fallback
 * 
 * Replaces resolveRestaurantImage from restaurant-cache.ts
 * 
 * @param place - Place object
 * @returns Image URL or null
 */
export function resolveProxyPhotoUrl(place: Place): string | null {
    // Priority 1: Custom owner photos (if claimed)
    if (place.isClaimed && place.customPhotos && place.customPhotos.length > 0) {
        return place.customPhotos[0].url;
    }

    // Priority 2: New proxyPhotoUrl from photos array
    if (place.photos && place.photos.length > 0) {
        const firstPhoto = place.photos[0];
        if (firstPhoto.proxyPhotoUrl) {
            return firstPhoto.proxyPhotoUrl;
        }
    }

    // Priority 3: Top-level proxyPhotoUrl
    if (place.proxyPhotoUrl) {
        return place.proxyPhotoUrl;
    }

    // Priority 4: Legacy imageSrc
    if (place.imageSrc) {
        return place.imageSrc;
    }

    return null;
}

