/**
 * AI-powered restaurant discovery endpoint with grid-based caching.
 * 
 * Features:
 * - Caches Google Places API results in Firestore by coordinate grid
 * - Returns places with TTL-based cache management
 * - Supports user preference filtering
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { createGridKey, placeToCache, cacheToPlace, CachedPlace, PlacesCacheEntry } from "@/types/cached-places";
import { Place } from "@/types/place";

// Cache TTL: 24 hours
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get("lat") || "0");
    const lng = parseFloat(searchParams.get("lng") || "0");
    const radius = parseInt(searchParams.get("radius") || "5000", 10);
    const type = searchParams.get("type") || "restaurant";
    const keyword = searchParams.get("keyword") || "";

    if (!lat || !lng) {
        return NextResponse.json({ error: "Location (lat, lng) required" }, { status: 400 });
    }

    if (!process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY) {
        return NextResponse.json({ error: "Missing API Key" }, { status: 500 });
    }

    // Create grid key for caching
    const gridKey = createGridKey(lat, lng, radius);
    const now = Date.now();

    try {
        // Check Firestore cache first
        const cacheRef = adminDb.collection("cached_places_grid").doc(gridKey);
        const cacheDoc = await cacheRef.get();

        if (cacheDoc.exists) {
            const cacheData = cacheDoc.data() as PlacesCacheEntry;

            // Check if cache is still valid
            if (cacheData.expires_at > now) {
                console.log(`[Discover] Cache HIT for grid ${gridKey}`);

                // Convert cached places back to Place format
                const places = cacheData.places.map(cacheToPlace);

                // Apply keyword filter if provided
                const filteredPlaces = keyword
                    ? places.filter(p =>
                        p.name.toLowerCase().includes(keyword.toLowerCase()) ||
                        p.types.some(t => t.toLowerCase().includes(keyword.toLowerCase()))
                    )
                    : places;

                return NextResponse.json({
                    results: filteredPlaces,
                    cache: {
                        hit: true,
                        grid_key: gridKey,
                        cached_at: cacheData.cached_at,
                        expires_at: cacheData.expires_at,
                    }
                });
            } else {
                console.log(`[Discover] Cache EXPIRED for grid ${gridKey}`);
            }
        } else {
            console.log(`[Discover] Cache MISS for grid ${gridKey}`);
        }

        // Cache miss or expired - fetch from Google Places API
        const baseUrl = keyword
            ? "https://maps.googleapis.com/maps/api/place/textsearch/json"
            : "https://maps.googleapis.com/maps/api/place/nearbysearch/json";

        const url = new URL(baseUrl);
        url.searchParams.append("key", process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY);

        if (keyword) {
            url.searchParams.append("query", `${keyword} ${type}`);
            url.searchParams.append("location", `${lat},${lng}`);
            url.searchParams.append("radius", radius.toString());
        } else {
            url.searchParams.append("location", `${lat},${lng}`);
            url.searchParams.append("radius", radius.toString());
            url.searchParams.append("type", type);
        }

        const res = await fetch(url.toString());
        const data = await res.json();

        if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
            console.error(`[Discover] Google Places API Error: ${data.status}`, data.error_message);
            return NextResponse.json({
                error: "Failed to fetch places",
                details: data.error_message
            }, { status: 500 });
        }

        const places: Place[] = data.results || [];

        // Cache the results in Firestore (only if we have results)
        if (places.length > 0) {
            const cachedPlaces: CachedPlace[] = places.map(p => placeToCache(p, gridKey, CACHE_TTL_MS));

            const cacheEntry: PlacesCacheEntry = {
                grid_key: gridKey,
                places: cachedPlaces,
                cached_at: now,
                expires_at: now + CACHE_TTL_MS,
                search_params: { lat, lng, radius, type }
            };

            // Save to Firestore (fire and forget for speed)
            cacheRef.set(cacheEntry).catch(err => {
                console.error("[Discover] Failed to cache places:", err);
            });
        }

        return NextResponse.json({
            results: places,
            cache: {
                hit: false,
                grid_key: gridKey,
                cached_at: now,
                expires_at: now + CACHE_TTL_MS,
            }
        });

    } catch (error) {
        console.error("[Discover] Error:", error);
        return NextResponse.json({ error: "Failed to discover places" }, { status: 500 });
    }
}
