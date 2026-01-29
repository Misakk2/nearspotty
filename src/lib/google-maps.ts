/**
 * Google Maps API Loader for Next.js
 *
 * Uses @googlemaps/js-api-loader v2.x with setOptions() and importLibrary() API.
 */

import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

let isConfigured = false;

/**
 * Initialize the Google Maps JavaScript API configuration.
 * This must be called once before using any google.maps APIs.
 */
export const loadGoogleMaps = async (): Promise<void> => {
    if (isConfigured) return;

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

    if (!apiKey) {
        console.error("[Google Maps] API key is missing! Check NEXT_PUBLIC_GOOGLE_MAPS_KEY in .env.local");
        throw new Error("Google Maps API key not configured");
    }

    console.log("[Google Maps] Configuring with key:", apiKey.substring(0, 10) + "...");

    try {
        // v2 API uses setOptions() - must be called BEFORE any importLibrary() call
        setOptions({
            key: apiKey,
            v: "weekly",
            libraries: ["places", "geometry", "marker"],
        });
        isConfigured = true;
        console.log("[Google Maps] Configuration complete");
    } catch (error) {
        console.error("[Google Maps] Configuration failed:", error);
        throw error;
    }
};

/**
 * Get a specific Google Maps library.
 * Ensures the API is configured first, then imports the library.
 *
 * @param name - Library name: 'maps', 'places', 'geometry', 'marker', etc.
 * @returns The requested library module
 */
export const getMapLibrary = async <T = google.maps.MapsLibrary>(name: string): Promise<T> => {
    await loadGoogleMaps();

    // v2 API uses importLibrary() from the package directly
    return importLibrary(name) as Promise<T>;
};

/**
 * Shim object to maintain backward compatibility with existing components.
 * Components can import this default export and use importLibrary().
 */
const loaderShim = {
    importLibrary: async <T = google.maps.MapsLibrary>(name: string): Promise<T> => {
        return getMapLibrary<T>(name);
    },
};

export default loaderShim;
