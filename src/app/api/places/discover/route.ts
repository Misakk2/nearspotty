/**
 * AI-powered restaurant discovery endpoint with grid-based caching.
 * 
 * Features:
 * - Caches Google Places API results in Firestore by coordinate grid
 * - Returns places with TTL-based cache management
 * - Supports user preference filtering
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { createGridKey, placeToCache, cacheToPlace, CachedPlace, PlacesCacheEntry } from "@/types/cached-places";
import { Place } from "@/types/place";
import { getCache, setCache } from "@/lib/cache-utils";
import { CACHE_DURATIONS } from "@/lib/cache-config";

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

    if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY) {
        return NextResponse.json({ error: "Missing API Key" }, { status: 500 });
    }

    // Create grid key for caching
    // Note: Radius IS now part of the key to support specific search sizes
    const gridKey = createGridKey(lat, lng, radius);
    const now = Date.now();

    try {
        // Check Unified Cache
        const cacheData = await getCache<PlacesCacheEntry>("places_grid_cache", gridKey);

        if (cacheData) {
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

            // --------------------------------------------------------------------------
            // OVERRIDE LOGIC: Fetch claimed restaurant data and merge
            // --------------------------------------------------------------------------
            const finalResults = [...filteredPlaces];

            if (finalResults.length > 0) {
                try {
                    const placeIds = finalResults.map(p => p.place_id);
                    const db = getAdminDb();

                    const claimedDocs = await Promise.all(
                        placeIds.map(id => db.collection("restaurants").doc(id).get())
                    );

                    claimedDocs.forEach(doc => {
                        if (doc.exists) {
                            const data = doc.data();
                            if (data?.isClaimed) {
                                const index = finalResults.findIndex(p => p.place_id === doc.id);
                                if (index !== -1) {
                                    // Merge logic
                                    const place = finalResults[index];
                                    finalResults[index] = {
                                        ...place,
                                        name: data.name || place.name,
                                        formatted_address: data.address || place.formatted_address,
                                        price_level: data.avgCheck ? (data.avgCheck > 50 ? 4 : data.avgCheck > 30 ? 3 : data.avgCheck > 15 ? 2 : 1) : place.price_level,
                                        types: data.cuisineTypes && data.cuisineTypes.length > 0 ? [...data.cuisineTypes, ...place.types] : place.types
                                    };
                                }
                            }
                        }
                    });

                } catch (err) {
                    console.error("[Discover] Failed to fetch claim overrides (Cache Hit):", err);
                }
            }

            return NextResponse.json({
                results: finalResults,
                cache: {
                    hit: true,
                    grid_key: gridKey,
                    cached_at: cacheData.cached_at,
                    expires_at: cacheData.expires_at,
                }
            });
        }

        console.log(`[Discover] Cache MISS for grid ${gridKey}`);

        // Cache miss or expired - fetch from Google Places API
        // MIGRATION: Switched to Places API v1 to support Field Masking (Cost Saving)
        const baseUrl = keyword
            ? "https://places.googleapis.com/v1/places:searchText"
            : "https://places.googleapis.com/v1/places:searchNearby";

        const googleRes = await fetch(baseUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY as string,
                "X-Goog-FieldMask": "places.name,places.id,places.displayName,places.formattedAddress,places.types,places.rating,places.userRatingCount,places.priceLevel,places.photos,places.location,places.regularOpeningHours,places.reviews"
            },
            body: JSON.stringify({
                ...(keyword ? { textQuery: `${keyword} ${type}` } : {}),
                locationRestriction: {
                    circle: {
                        center: { latitude: lat, longitude: lng },
                        radius: radius
                    }
                },
                maxResultCount: 20
            })
        });

        const data = await googleRes.json();

        if (!googleRes.ok) {
            console.error(`[Discover] Google Places API Error: ${googleRes.status}`, data);
            return NextResponse.json({
                error: "Failed to fetch places",
                details: data.error?.message || "Unknown error"
            }, { status: 500 });
        }

        // Helper to convert V1 Price Level to Legacy Number
        const mapPriceLevel = (level: string): number | undefined => {
            switch (level) {
                case "PRICE_LEVEL_FREE": return 0;
                case "PRICE_LEVEL_INEXPENSIVE": return 1;
                case "PRICE_LEVEL_MODERATE": return 2;
                case "PRICE_LEVEL_EXPENSIVE": return 3;
                case "PRICE_LEVEL_VERY_EXPENSIVE": return 4;
                default: return undefined;
            }
        };

        // Map v1 response structure to our Place interface
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const places: Place[] = (data.places || []).map((p: any) => ({
            place_id: p.id,
            name: p.displayName?.text || p.id,
            formatted_address: p.formattedAddress,
            rating: p.rating,
            user_ratings_total: p.userRatingCount,
            price_level: p.priceLevel ? mapPriceLevel(p.priceLevel) : undefined,
            geometry: {
                location: {
                    lat: p.location?.latitude || 0,
                    lng: p.location?.longitude || 0
                }
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            photos: p.photos?.map((photo: any) => ({
                name: photo.name, // Resource Name for V1
                width: photo.widthPx,
                height: photo.heightPx,
                author_attributions: photo.authorAttributions
            })),
            types: p.types || [],
            imageSrc: "",

            // Map V1 Opening Hours to Legacy Format
            opening_hours: p.regularOpeningHours ? {
                open_now: p.regularOpeningHours.openNow,
                weekday_text: p.regularOpeningHours.weekdayDescriptions
            } : undefined,

            // Map V1 Reviews to Legacy Format
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            reviews: p.reviews?.map((r: any) => ({
                author_name: r.authorAttribution?.displayName || "Anonymous",
                rating: r.rating,
                text: r.text?.text || "",
                time: r.publishTime ? new Date(r.publishTime).getTime() / 1000 : 0,
                relative_time_description: r.relativePublishTimeDescription,
                profile_photo_url: r.authorAttribution?.photoUri || ""
            }))
        }));

        // Cache the results in Firestore (unified)
        if (places.length > 0) {
            const cachedPlaces: CachedPlace[] = places.map(p => placeToCache(p, gridKey, CACHE_DURATIONS.PLACES_GRID));

            const cacheEntry: PlacesCacheEntry = {
                grid_key: gridKey,
                places: cachedPlaces,
                cached_at: now,
                expires_at: now + CACHE_DURATIONS.PLACES_GRID,
                search_params: { lat, lng, radius, type }
            };

            // Unified Cache Set - Pass a userId if available, or 'system'
            // Since this is a public endpoint, we might not have userId readily available in the GET params without auth check
            // We'll pass 'system-discover' as the user for now to satisfy the type requirement if strict, 
            // but setCache takes optional userId.
            setCache("places_grid_cache", gridKey, cacheEntry, CACHE_DURATIONS.PLACES_GRID, "system-discover");
        }

        // --------------------------------------------------------------------------
        // OVERRIDE LOGIC: Fetch claimed restaurant data and merge
        // --------------------------------------------------------------------------
        const finalResults = [...places];

        if (finalResults.length > 0) {
            try {
                const placeIds = finalResults.map(p => p.place_id);
                // Firestore 'in' query limit is 10 usually? Actually 30.
                // Our maxResultCount is 20. So it is safe.
                const db = getAdminDb();


                // Wait, 'in' query on documentId is tricky without the FieldPath object.
                // Simpler approach compatible with our limited imports:
                // Just use getAll if possible, or multiple reads (parallel).
                // Since max 20, parallel reads are fast enough.

                const claimedDocs = await Promise.all(
                    placeIds.map(id => db.collection("restaurants").doc(id).get())
                );

                claimedDocs.forEach(doc => {
                    if (doc.exists) {
                        const data = doc.data();
                        if (data?.isClaimed) {
                            const index = finalResults.findIndex(p => p.place_id === doc.id);
                            if (index !== -1) {
                                // Merge logic
                                const place = finalResults[index];
                                finalResults[index] = {
                                    ...place,
                                    name: data.name || place.name,
                                    formatted_address: data.address || place.formatted_address,
                                    // Map average check to price level (approximate)
                                    price_level: data.avgCheck ? (data.avgCheck > 50 ? 4 : data.avgCheck > 30 ? 3 : data.avgCheck > 15 ? 2 : 1) : place.price_level,
                                    // We could append custom cuisine types to 'types' or strictly use them
                                    types: data.cuisineTypes && data.cuisineTypes.length > 0 ? [...data.cuisineTypes, ...place.types] : place.types
                                };
                            }
                        }
                    }
                });

            } catch (err) {
                console.error("[Discover] Failed to fetch claim overrides:", err);
                // Continue with Google results on error
            }
        }

        return NextResponse.json({
            results: finalResults,
            cache: {
                hit: false, // Technically the base result might be a hit, but we modified it.
                // Actually, if we hit the cache loop above, we RETURNED already.
                // We need to move this logic to AFTER the cache/fetch split, OR duplicate it.
                // The current code returns early on cache hit.
                // I need to apply this override logic to BOTH paths.
                grid_key: gridKey,
                cached_at: now,
                expires_at: now + CACHE_DURATIONS.PLACES_GRID,
            }
        });

    } catch (error) {
        console.error("[Discover] Error:", error);
        return NextResponse.json({ error: "Failed to discover places" }, { status: 500 });
    }
}
