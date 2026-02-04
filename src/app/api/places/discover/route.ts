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

    if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY) {
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
        // MIGRATION: Switched to Places API v1 to support Field Masking (Cost Saving)
        const baseUrl = keyword
            ? "https://places.googleapis.com/v1/places:searchText"
            : "https://places.googleapis.com/v1/places:searchNearby";

        const googleRes = await fetch(baseUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY as string,
                // COST SAVING: Only fetch what we display on the card
                // Basic: name, id, photos, types
                // Contact: opening hours (User Requested)
                // Atmosphere: rating, userRatingCount, priceLevel, reviews (User Requested)
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
            reviews: p.reviews?.map((r: any) => ({
                author_name: r.authorAttribution?.displayName || "Anonymous",
                rating: r.rating,
                text: r.text?.text || "",
                time: r.publishTime ? new Date(r.publishTime).getTime() / 1000 : 0,
                relative_time_description: r.relativePublishTimeDescription,
                profile_photo_url: r.authorAttribution?.photoUri || ""
            }))
        }));

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
