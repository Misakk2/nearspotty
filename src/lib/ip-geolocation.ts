/**
 * IP-based geolocation fallback utility.
 * 
 * Used when navigator.geolocation fails (Error 2: POSITION_UNAVAILABLE).
 * Tries multiple free APIs with proper error handling.
 */

interface IPLocationResponse {
    lat: number;
    lng: number;
    city?: string;
    country?: string;
}

/**
 * Get approximate location from IP address.
 * Tries ipapi.co first, then ip-api.com as fallback.
 * 
 * @returns Location coordinates or null if all APIs fail
 */
export async function getLocationFromIP(): Promise<IPLocationResponse | null> {
    // Try ipapi.co first (45k requests/month free)
    try {
        const response = await fetch('https://ipapi.co/json/', {
            signal: AbortSignal.timeout(5000) // 5 second timeout
        });

        if (response.ok) {
            const data = await response.json();
            if (data.latitude && data.longitude) {
                console.log('[IP Geolocation] ipapi.co success:', data.city, data.country_name);
                return {
                    lat: data.latitude,
                    lng: data.longitude,
                    city: data.city,
                    country: data.country_name
                };
            }
        }
    } catch (error) {
        console.warn('[IP Geolocation] ipapi.co failed:', error);
    }

    // Fallback to ip-api.com (45 requests/minute free, no HTTPS on free tier)
    try {
        const response = await fetch('http://ip-api.com/json/', {
            signal: AbortSignal.timeout(5000)
        });

        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success' && data.lat && data.lon) {
                console.log('[IP Geolocation] ip-api.com success:', data.city, data.country);
                return {
                    lat: data.lat,
                    lng: data.lon,
                    city: data.city,
                    country: data.country
                };
            }
        }
    } catch (error) {
        console.warn('[IP Geolocation] ip-api.com failed:', error);
    }

    console.error('[IP Geolocation] All IP geolocation APIs failed');
    return null;
}

/**
 * Generate a grid-key for caching places by location.
 * Rounds coordinates to ~100m precision (3 decimal places).
 * 
 * @param lat Latitude
 * @param lng Longitude
 * @returns Grid key string like "48.149_17.108"
 */
export function generateGridKey(lat: number, lng: number): string {
    const roundedLat = Math.round(lat * 1000) / 1000;
    const roundedLng = Math.round(lng * 1000) / 1000;
    return `${roundedLat}_${roundedLng}`;
}
