/**
 * City Cache Helper - Firestore-based caching for city lookups
 * 
 * Implements cache-first strategy to reduce Google Places API calls:
 * 1. Check Firestore 'cities' collection for cached city
 * 2. If not found, caller fetches from Google Places API
 * 3. Store new city lookups for future use
 */

import { db, auth } from "@/lib/firebase"; // Added auth
import { doc, getDoc, setDoc, collection, query, where, getDocs, limit } from "firebase/firestore";
// Define __app_id on window
declare global {
    interface Window {
        __app_id?: string;
    }
}

// Helper to get the correct collection reference
const getCacheCollection = () => {
    // We are now using the root 'cities' collection as per Phase 3 Security Plan
    // This matches: match /cities/{cityId} in firestore.rules
    return collection(db, 'cities');
};

export interface CachedCity {
    id: string;
    name: string;
    fullName: string; // e.g., "Vienna, Austria"
    lat: number;
    lng: number;
    country?: string;
    placeId?: string;
    createdAt: string;
    accessCount: number;
}

/**
 * Search for a city in the Firestore cache
 * Uses case-insensitive search on the name field
 */
export async function getCityFromCache(cityName: string): Promise<CachedCity | null> {
    if (!cityName || cityName.length < 2) return null;

    try {
        const normalizedName = cityName.toLowerCase().trim();
        const citiesRef = getCacheCollection(); // Use new collection

        // First try exact match by ID (normalized name) within the new collection
        // We need to construct the doc ref manually relative to the collection
        // collection() returns a CollectionReference. We can use doc(CollectionReference, id).
        const exactDoc = await getDoc(doc(citiesRef, normalizedName));
        if (exactDoc.exists()) {
            const data = exactDoc.data() as CachedCity;
            // Increment access count (fire and forget - don't fail read if write fails)
            // Note: We need a doc ref within the new collection structure for updates
            // But since this is a read operation, we rely on the path we queried.
            // CAUTION: 'exactDoc.ref' points to the document we just read.
            setDoc(exactDoc.ref, { accessCount: (data.accessCount || 0) + 1 }, { merge: true })
                .catch(e => console.warn("[CityCache] Failed to update access count:", e));

            return { ...data, id: exactDoc.id };
        }

        // Try partial match query (starts with)
        const q = query(
            citiesRef,
            where("nameNormalized", ">=", normalizedName),
            where("nameNormalized", "<=", normalizedName + "\uf8ff"),
            limit(5)
        );

        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            const data = doc.data() as CachedCity;
            return { ...data, id: doc.id };
        }

        return null;
    } catch (error) {
        console.error("[CityCache] Error fetching from cache:", error);
        return null;
    }
}

/**
 * Save a city to the Firestore cache
 */
export async function saveCityToCache(city: Omit<CachedCity, "id" | "createdAt" | "accessCount">): Promise<void> {
    if (!city.placeId) {
        console.warn("[CityCache] Cannot save city without placeId");
        return;
    }

    try {
        // Use the new Secure Crowdsourcing API
        // This validates the city with Google and writes it via Admin SDK
        const token = await auth.currentUser?.getIdToken();
        if (!token) {
            console.warn("[CityCache] User not authenticated, cannot save city.");
            return;
        }

        await fetch('/api/cities/add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ placeId: city.placeId })
        });

        console.log("[CityCache] Saved city to cache via API:", city.name);
    } catch (error) {
        console.error("[CityCache] Error saving to cache:", error);
    }
}

/**
 * Get multiple city suggestions from cache
 * Used for autocomplete before falling back to Google Places API
 */
export async function getCitySuggestionsFromCache(searchQuery: string, maxResults = 5): Promise<CachedCity[]> {
    if (!searchQuery || searchQuery.length < 2) return [];

    try {
        const normalizedQuery = searchQuery.toLowerCase().trim();
        const citiesRef = getCacheCollection();

        const q = query(
            citiesRef,
            where("nameNormalized", ">=", normalizedQuery),
            where("nameNormalized", "<=", normalizedQuery + "\uf8ff"),
            limit(maxResults)
        );

        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            ...doc.data() as CachedCity,
            id: doc.id,
        }));
    } catch (error) {
        console.error("[CityCache] Error getting suggestions:", error);
        return [];
    }
}
