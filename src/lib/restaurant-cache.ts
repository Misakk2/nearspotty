/**
 * Smart Restaurant Cache with Geohash Queries
 * 
 * Features:
 * - Cache-first light discovery with adaptive fetching
 * - Geohash-based proximity queries (~1.2km precision)
 * - Light→Rich data upgrade logic
 * - 7-day TTL with automatic expiration
 */

import { getAdminDb } from "@/lib/firebase-admin";
import type { Restaurant, RestaurantImage } from "@/types";
import geohash from "ngeohash";

const CACHE_TTL_DAYS = 7;
const CACHE_TTL_MS = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
const GEOHASH_PRECISION = 6; // ~1.2km precision for geo-queries

/**
 * Get restaurant from Firestore cache or fetch from Google Places API
 * Implements cache-first strategy with 7-day TTL
 * 
 * @param placeId - Google Place ID
 * @param forceRefresh - Bypass cache and fetch fresh data
 * @returns Restaurant data with resolved images
 */
export async function getOrFetchRestaurant(
    placeId: string,
    forceRefresh = false
): Promise<Restaurant | null> {
    const restaurantRef = getAdminDb().collection('restaurants').doc(placeId);
    const doc = await restaurantRef.get();

    // Check cache validity
    if (doc.exists && !forceRefresh) {
        const cached = doc.data() as Restaurant;

        // Is cache still fresh?
        if (!isCacheStale(cached.cacheMetadata.expiresAt)) {
            console.log(`[RestaurantCache] ✅ HIT: ${placeId}`);
            return cached;
        }

        console.log(`[RestaurantCache] ⏰ STALE: ${placeId}. Refreshing...`);
    }

    // Cache MISS or STALE - Fetch from Google
    console.log(`[RestaurantCache] ❌ MISS: ${placeId}. Fetching from Google...`);

    try {
        const googleData = await fetchFromGooglePlaces(placeId);
        if (!googleData) return null;

        const restaurant = await saveRestaurantToCache(placeId, googleData, doc.data() as Restaurant | undefined);
        return restaurant;
    } catch (error) {
        console.error(`[RestaurantCache] Failed to fetch ${placeId}:`, error);
        // Return stale cache if available
        return doc.exists ? (doc.data() as Restaurant) : null;
    }
}

/**
 * Resolve best image URL using priority logic:
 * 1. Owner primary image (if claimed)
 * 2. Cached Google image
 * 3. Proxy reference
 * 
 * @param restaurant - Restaurant entity
 * @returns Image URL or null
 */
export function resolveRestaurantImage(restaurant: Restaurant): string | null {
    // Priority 1: Owner images (if claimed)
    if (restaurant.claimed && restaurant.images.owner.length > 0) {
        const primary = restaurant.images.owner.find(img => img.isPrimary);
        if (primary) return primary.url;
        return restaurant.images.owner[0].url; // Fallback to first
    }

    // Priority 2: Cached Google image
    if (restaurant.images.google.length > 0) {
        const firstImage = restaurant.images.google[0];
        if (firstImage.cachedUrl) {
            return firstImage.cachedUrl;
        }

        // Priority 3: Proxy reference
        return `/api/images/proxy?ref=${firstImage.photoReference}&id=${restaurant.placeId}`;
    }

    return null;
}

/**
 * Check if cache entry is stale (expired)
 * @param expiresAt - ISO timestamp
 * @returns true if cache should be refreshed
 */
function isCacheStale(expiresAt: string): boolean {
    return new Date(expiresAt).getTime() < Date.now();
}

/**
 * Fetch place details from Google Places API V1
 * @param placeId - Google Place ID
 * @returns Place data or null if not found
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchFromGooglePlaces(placeId: string): Promise<any> {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    if (!apiKey) throw new Error('Missing NEXT_PUBLIC_GOOGLE_MAPS_KEY');

    const url = `https://places.googleapis.com/v1/places/${placeId}`;
    const fieldMask = [
        'id',
        'displayName',
        'formattedAddress',
        'location',
        'rating',
        'userRatingCount',
        'priceLevel',
        'types',
        'businessStatus',          // For pre-enrichment filtering
        'nationalPhoneNumber',
        'websiteUri',
        'regularOpeningHours',
        'photos'
    ].join(',');

    const response = await fetch(url, {
        headers: {
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': fieldMask
        }
    });

    if (!response.ok) {
        console.error(`[RestaurantCache] Google API failed: ${response.status}`);
        return null;
    }

    return await response.json();
}

/**
 * Save or update restaurant in Firestore
 * Handles both LIGHT (Stage 1) and RICH (Stage 3) data saves.
 * Infers dataLevel based on content.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function saveRestaurantToCache(
    placeId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    googleData: any,
    existing?: Restaurant
): Promise<Restaurant> {
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString();

    // INFER DATA LEVEL:
    // If we have reviews OR opening hours OR editorial summary -> It's RICH
    const isRich = !!(
        googleData.reviews?.length > 0 ||
        googleData.regularOpeningHours ||
        googleData.editorialSummary
    );

    // Parse Google Photos if present
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const googleImages: RestaurantImage[] = (googleData.photos || []).map((photo: any) => ({
        photoReference: photo.name, // V1 uses resource name as reference
        width: photo.widthPx || 0,
        height: photo.heightPx || 0,
        // cachedUrl will be populated by image proxy on demand
    }));

    const restaurant: Restaurant = {
        placeId,
        details: {
            name: googleData.displayName?.text || googleData.name || 'Unknown',
            address: googleData.formattedAddress || '',
            geometry: {
                location: {
                    lat: googleData.location?.latitude || 0,
                    lng: googleData.location?.longitude || 0
                }
            },
            rating: googleData.rating,
            priceLevel: googleData.priceLevel,
            types: googleData.types || [],
            businessStatus: googleData.businessStatus,  // "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY"
            phoneNumber: googleData.nationalPhoneNumber,
            website: googleData.websiteUri,
            openingHours: googleData.regularOpeningHours, // RICH only
            userRatingCount: googleData.userRatingCount,
            formattedAddress: googleData.formattedAddress,
            editorialSummary: googleData.editorialSummary?.text // RICH only
        },
        images: {
            google: googleImages,
            // CRITICAL: Preserve owner images on refresh
            owner: existing?.images.owner || []
        },
        // CRITICAL: Never reset claim status
        claimed: existing?.claimed || false,
        claimedBy: existing?.claimedBy,
        claimedAt: existing?.claimedAt,
        cacheMetadata: {
            lastFetched: now,
            expiresAt,
            source: 'google',
            // CRITICAL: Upgrade logic. If we already had RICH, keep it RICH (unless we just fetched LIGHT, which shouldn't happen in enrichment flow)
            // Actually, if we are saving, we trust the new data's level, OR we preserve 'rich' if we are doing a partial update? 
            // In our current flow, we either fetch LIGHT or RICH. 
            // If we fetch LIGHT, we save LIGHT. If we fetch RICH, we save RICH.
            // But wait! If we overwrite a RICH doc with LIGHT data, we lose data!
            // SAFEGUARD: If existing is RICH and new is LIGHT, retain RICH (but update fields?)
            // No, Stage 1 (Light) should NOT overwrite Stage 3 (Rich) data if it exists.
            // Logic: dataLevel = (newData is Rich) ? 'rich' : (existing is Rich ? 'rich' : 'light')
            dataLevel: isRich ? 'rich' : (existing?.cacheMetadata.dataLevel === 'rich' ? 'rich' : 'light')
        },
        // Compute geohash for geo-queries
        geohash: geohash.encode(
            googleData.location?.latitude || 0,
            googleData.location?.longitude || 0,
            GEOHASH_PRECISION
        ),
        createdAt: existing?.createdAt || now,
        updatedAt: now
    };

    // Prevent overwriting rich data with light data if we are in a weird race condition
    // But usually simple merge is enough. 
    // The safeguard above in `dataLevel` is good, but we should also ensure we don't nullify rich fields if `isRich` is false but existing was true.
    // However, typically we fetch LIGHT for new searches. If getting details, we fetch RICH.
    // So if we save LIGHT, we might be overwriting.
    // IMPLEMENTATION DETAIL: In findLightCandidates, we might save LIGHT data. 
    // If a place was already RICH, we should probably NOT overwrite it with LIGHT data, or merging needs to be smarter.
    // For now, let's assume if we are saving, we want to save this state. 
    // But to be safe: If inferred `isRich` is false, but existing `dataLevel` is 'rich', we should probably MERGE carefully.
    // Complex merge is risky. Let's rely on the fact that if we have RICH data in cache, findLightCandidates uses it (read-only) or upgrades it?
    // findLightCandidates READS. It might add new entries. 
    // Update logic: `saveRestaurantToCache` is called when we have FRESH data. 
    // If we have fresh LIGHT data, but stale RICH data, what do we do?
    // We treat it as Valid Match in findCandidates. We don't save LIGHT over RICH usually unless forcing.

    await getAdminDb().collection('restaurants').doc(placeId).set(restaurant, { merge: true });
    console.log(`[RestaurantCache] 💾 SAVED: ${placeId} [${restaurant.cacheMetadata.dataLevel}]`);

    return restaurant;
}

/**
 * Query restaurants from cache by geographic proximity using geohash.
 * Returns restaurants within ~1.2km of given coordinates.
 * 
 * @param lat - Latitude
 * @param lng - Longitude
 * @param maxResults - Maximum number of results to return (default: 20)
 * @returns Array of cached restaurants sorted by freshness
 */
export async function getCachedRestaurantsByLocation(
    lat: number,
    lng: number,
    maxResults: number = 20
): Promise<Restaurant[]> {
    const hash = geohash.encode(lat, lng, GEOHASH_PRECISION);

    // Query by geohash prefix (all restaurants in same geohash cell)
    const snapshot = await getAdminDb()
        .collection('restaurants')
        .where('geohash', '>=', hash)
        .where('geohash', '<=', hash + '\uf8ff')
        .limit(maxResults * 2) // Get extra to filter stale
        .get();

    const validRestaurants: Restaurant[] = [];

    snapshot.forEach(doc => {
        const data = doc.data() as Restaurant;

        // Only include non-stale entries
        if (!isCacheStale(data.cacheMetadata.expiresAt)) {
            validRestaurants.push(data);
        }
    });

    // Sort by cache freshness (newest first) and limit
    return validRestaurants
        .sort((a, b) => {
            const timeA = new Date(a.updatedAt).getTime();
            const timeB = new Date(b.updatedAt).getTime();
            return timeB - timeA;
        })
        .slice(0, maxResults);
}

/**
 * Stage 3 Enrichment: Mass fetch details for winners.
 * Handles "Partial Cache" upgrades (Light -> Rich).
 * 
 * @param placeIds - List of place IDs to enrich
 */
export async function getEnrichedRestaurants(placeIds: string[]): Promise<Restaurant[]> {
    if (placeIds.length === 0) return [];

    const db = getAdminDb();
    const refs = placeIds.map(id => db.collection('restaurants').doc(id));
    const snapshots = await db.getAll(...refs);

    const results: Restaurant[] = [];
    const needsFetchIds: string[] = [];

    // 1. Categorize Hits vs Misses
    snapshots.forEach((snap, index) => {
        const id = placeIds[index];
        if (snap.exists) {
            const data = snap.data() as Restaurant;
            const isStale = isCacheStale(data.cacheMetadata.expiresAt);
            const isRich = data.cacheMetadata.dataLevel === 'rich';

            if (!isStale && isRich) {
                // ✅ VALID HIT: Rich and Fresh
                results.push(data);
            } else {
                // ⚠️ NEEDS UPGRADE: Stale OR Only Light
                console.log(`[Enrich] Needs fetch: ${id} (Stale: ${isStale}, Level: ${data.cacheMetadata.dataLevel})`);
                needsFetchIds.push(id);
            }
        } else {
            // ❌ MISS
            console.log(`[Enrich] Cache duplicate/miss: ${id}`);
            needsFetchIds.push(id);
        }
    });

    // 2. Batch Fetch Missing/Stale from Google
    if (needsFetchIds.length > 0) {
        console.log(`[Enrich] Fetching ${needsFetchIds.length} places from Google...`);

        // Parallel fetch for speed
        const fetchPromises = needsFetchIds.map(async (id) => {
            try {
                const googleData = await fetchFromGooglePlaces(id); // Returns RICH data by default mask
                if (googleData) {
                    // Get existing doc to preserve owner data if any
                    const existingDoc = snapshots.find(s => s.id === id);
                    const existingData = existingDoc?.exists ? existingDoc.data() as Restaurant : undefined;

                    return await saveRestaurantToCache(id, googleData, existingData);
                }
                return null;
            } catch (err) {
                console.error(`[Enrich] Failed to fetch ${id}:`, err);
                return null;
            }
        });

        const fetchedResults = await Promise.all(fetchPromises);

        // Add successful fetches to results
        fetchedResults.forEach(r => {
            if (r) results.push(r);
        });
    }

    // 3. Return merged results (preserving order if possible, but map-reduce is cleaner)
    // Re-sort to match input order? Not strictly required but nice.
    const resultMap = new Map(results.map(r => [r.placeId, r]));
    return placeIds.map(id => resultMap.get(id)).filter((r): r is Restaurant => !!r);
}
