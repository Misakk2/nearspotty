/**
 * City Cache Helper - Firestore-based caching for city lookups
 * 
 * Implements cache-first strategy to reduce Google Places API calls:
 * 1. Check Firestore 'cities' collection for cached city
 * 2. If not found, caller fetches from Google Places API
 * 3. Store new city lookups for future use
 */

import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, collection, query, where, getDocs, limit } from "firebase/firestore";

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
        const citiesRef = collection(db, "cities");

        // First try exact match by normalized name
        const exactDoc = await getDoc(doc(db, "cities", normalizedName));
        if (exactDoc.exists()) {
            const data = exactDoc.data() as CachedCity;
            // Increment access count (fire and forget)
            setDoc(doc(db, "cities", normalizedName), { accessCount: (data.accessCount || 0) + 1 }, { merge: true });
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
    try {
        const normalizedName = city.name.toLowerCase().trim();
        const cityData: Omit<CachedCity, "id"> = {
            ...city,
            createdAt: new Date().toISOString(),
            accessCount: 1,
        };

        // Store with normalized name as document ID for easy lookup
        await setDoc(doc(db, "cities", normalizedName), {
            ...cityData,
            nameNormalized: normalizedName,
        });

        console.log("[CityCache] Saved city to cache:", city.name);
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
        const citiesRef = collection(db, "cities");

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
