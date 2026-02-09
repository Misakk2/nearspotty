/**
 * Cached place data for minimizing Google Places API calls.
 * Places are cached by coordinate grid to enable location-based queries.
 */

import { Place } from './place';

export interface CachedPlace {
    place_id: string;
    basic_info: {
        name: string;
        rating: number;
        user_ratings_total: number;
        types: string[];
        price_level?: number;
        vicinity: string;
        formatted_address?: string; // Stored address
        photos?: {
            photo_reference: string;
            height: number;
            width: number;
        }[];
        opening_hours?: {
            open_now: boolean;
            weekday_text?: string[];
        };
        imageSrc?: string; // Cached image URL
    };
    reviews?: {
        author_name: string;
        rating: number;
        text: string;
        time: number;
        relative_time_description: string;
        profile_photo_url: string;
    }[];
    menu_data?: string;        // Extracted menu text from website if available
    geometry: {
        location: {
            lat: number;
            lng: number;
        };
    };
    cached_at: number;          // Timestamp when cached
    grid_key: string;           // e.g., "48.14_17.10_5000" for coordinate grid
    expires_at: number;         // Timestamp when cache expires
}

/**
 * Cache metadata for a coordinate grid area.
 */
export interface PlacesCacheEntry {
    grid_key: string;
    places: CachedPlace[];
    cached_at: number;
    expires_at: number;
    search_params: {
        lat: number;
        lng: number;
        radius: number;
        type?: string;
    };
    // Cache Warming Signals
    last_accessed?: number; // Timestamp of last HIT
    usage_count?: number;   // Number of HITS to determine popularity
}

/**
 * Creates a grid key for caching based on coordinates and radius.
 * Rounds coordinates to ~100m precision for efficient cache hits.
 */
/**
 * Creates a grid key for caching based on coordinates and radius.
 * Uses ~5km granularity (0.05 degrees) to group nearby searches.
 */
/**
 * Creates a grid key for caching based on coordinates and radius.
 * Uses dynamic grid sizing: larger radius -> larger grid cells.
 * Base grid size is ~5.5km (0.05 deg).
 */
export function createGridKey(lat: number, lng: number, radiusMeters: number = 5000): string {
    // Dynamic grid sizing formula:
    // 5000m -> 0.05 deg (approx 5.5km)
    // 1000m -> 0.01 deg (approx 1.1km)
    // This prevents small radius searches from over-fetching large grids,
    // and large radius searches from fragmenting into too many small grids.

    // Convert logic: 1 degree approx 111km.
    // We want grid size to be roughly 1.5x - 2x the search radius to cover edges.
    // Min grid size 0.01 (approx 1km) to avoid too many small keys.
    const targetGridSizeDeg = (radiusMeters / 111000) * 1.5;

    // Snap to nearest 0.01 step for consistency
    const GRID_SIZE = Math.max(0.01, Math.ceil(targetGridSizeDeg * 100) / 100);

    const roundedLat = Math.floor(lat / GRID_SIZE) * GRID_SIZE;
    const roundedLng = Math.floor(lng / GRID_SIZE) * GRID_SIZE;

    // Include radius bucket in key to separate "local" vs "wide" searches
    // Bucket radius to reduce fragmentation: nearest 1000m
    const radiusBucket = Math.round(radiusMeters / 1000) * 1000;

    return `${roundedLat.toFixed(2)}_${roundedLng.toFixed(2)}_r${radiusBucket}`;
}

/**
 * Returns grid keys for the current location and all surrounding grids.
 * Used to check for existing cache coverage including overlaps.
 */
export function getNearbyGridKeys(lat: number, lng: number, radiusMeters: number = 5000): string[] {
    // Re-calculate grid size used in createGridKey logic for consistency
    const targetGridSizeDeg = (radiusMeters / 111000) * 1.5;
    const GRID_SIZE = Math.max(0.01, Math.ceil(targetGridSizeDeg * 100) / 100);

    const keys: string[] = [];

    // Check center and 8 surrounding grids
    for (let x = -1; x <= 1; x++) {
        for (let y = -1; y <= 1; y++) {
            const neighborLat = lat + (x * GRID_SIZE);
            const neighborLng = lng + (y * GRID_SIZE);
            keys.push(createGridKey(neighborLat, neighborLng, radiusMeters));
        }
    }
    return [...new Set(keys)]; // Dedup
}

/**
 * Converts a Place object to CachedPlace format.
 */
export function placeToCache(place: Place, gridKey: string, ttlMs: number = 24 * 60 * 60 * 1000): CachedPlace {
    const now = Date.now();
    return {
        place_id: place.place_id,
        basic_info: {
            name: place.name,
            rating: place.rating || 0,
            user_ratings_total: place.user_ratings_total || 0,
            types: place.types,
            price_level: place.price_level,
            vicinity: place.vicinity || '',
            formatted_address: place.formatted_address,
            photos: place.photos?.filter(p => p.photo_reference).map(p => ({
                photo_reference: p.photo_reference as string,
                height: p.height,
                width: p.width
            })),
            opening_hours: place.opening_hours,
            imageSrc: place.imageSrc, // Save imageSrc
        },
        reviews: place.reviews,
        geometry: place.geometry,
        cached_at: now,
        grid_key: gridKey,
        expires_at: now + ttlMs,
    };
}

/**
 * Converts CachedPlace back to Place format for UI consumption.
 */
export function cacheToPlace(cached: CachedPlace): Place {
    return {
        place_id: cached.place_id,
        name: cached.basic_info.name,
        rating: cached.basic_info.rating,
        user_ratings_total: cached.basic_info.user_ratings_total,
        types: cached.basic_info.types,
        price_level: cached.basic_info.price_level,
        vicinity: cached.basic_info.vicinity,
        formatted_address: cached.basic_info.formatted_address,
        photos: cached.basic_info.photos,
        opening_hours: cached.basic_info.opening_hours,
        reviews: cached.reviews,
        geometry: cached.geometry,
        imageSrc: cached.basic_info.imageSrc || "/placeholder-restaurant.jpg", // Restore or fallback
        proxyPhotoUrl: cached.basic_info.imageSrc // Use proxy field
    };
}
