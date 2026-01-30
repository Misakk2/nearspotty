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
        formatted_address?: string;
        photos?: {
            photo_reference: string;
            height: number;
            width: number;
        }[];
        opening_hours?: {
            open_now: boolean;
            weekday_text?: string[];
        };
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
}

/**
 * Creates a grid key for caching based on coordinates and radius.
 * Rounds coordinates to ~100m precision for efficient cache hits.
 */
export function createGridKey(lat: number, lng: number, radius: number): string {
    // Round to 2 decimal places (~1.1km precision at equator)
    const roundedLat = Math.round(lat * 100) / 100;
    const roundedLng = Math.round(lng * 100) / 100;
    return `${roundedLat}_${roundedLng}_${radius}`;
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
            photos: place.photos,
            opening_hours: place.opening_hours,
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
    };
}
