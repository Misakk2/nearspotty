import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { reserveUserCredit, refundUserCredit } from "@/lib/user-limits";
import { scorePlacesWithDeepContext, scoutTopCandidates, PlaceWithContext, LightCandidate } from "@/lib/gemini";
import { getCachedRestaurantsByLocation, getEnrichedRestaurants, resolveRestaurantImage, saveRestaurantToCache } from "@/lib/restaurant-cache";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit"; // ✅ Rate Limit Import
import type { Restaurant, UserCredits } from "@/types";
import { z } from "zod"; // ✅ NEW: Zod validation

/**
 * Search & Ranking Pipeline - "Two-Stage AI Funnel" Strategy
 * 
 * Flow:
 * 1. findLightCandidates() -> Get 20 Place IDs with LIGHT fields (cheap)
 * 2. scoutTopCandidates()  -> Gemini selects TOP 6 (dietary-aware)
 * 3. enrichWinners()       -> Fetch RICH details for 6 only (expensive)
 * 4. Transaction           -> Deduct credit, run deep scoring
 * 5. Return TOP 5 results + credit state
 * 
 * COST SAVINGS: ~70% reduction (6 rich fetches vs 20)
 */

// Stage 1: Light fields for discovery (~$0.003/call)
const LIGHT_FIELD_MASK = [
    "places.id",
    "places.displayName",
    "places.types",
    "places.rating",
    "places.userRatingCount",
    "places.location"
].join(",");

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const RICH_FIELD_MASK = [
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.location",
    "places.photos",
    "places.rating",
    "places.userRatingCount",
    "places.priceLevel",
    "places.types",
    "places.editorialSummary",
    "places.reviews",
    "places.regularOpeningHours"
].join(",");

const BATCH_SIZE = 20;       // Discovery batch
const SCOUT_TOP_N = 6;       // AI Scout picks top N for enrichment
const TOP_RESULTS = 5;       // Final results to user
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const STALE_DAYS = 14;       // Enrichment threshold

// =============================================================================
// SEARCH INTENT PARSING (NLP Helper)
// =============================================================================

interface ParsedSearchIntent {
    cleanKeyword: string;        // Keyword without radius info, for Google & Gemini
    detectedRadius: number | null; // Radius in METERS (null = use default)
    hasSuperlative: boolean;     // "best", "najlepšia", "amazing" etc.
    rawQuery: string;            // Original user query for Gemini context
}

/**
 * Parses complex natural language search input.
 * Extracts radius with unit conversion and detects quality superlatives.
 * 
 * @example
 * parseSearchIntent("pizza 3 miles from me best one ever")
 * → { cleanKeyword: "pizza best one ever", detectedRadius: 4828.02, hasSuperlative: true, rawQuery: "..." }
 */
function parseSearchIntent(rawQuery: string): ParsedSearchIntent {
    let query = rawQuery.trim();
    let detectedRadius: number | null = null;

    // --- Regex patterns with unit conversion factors ---
    const unitPatterns: { pattern: RegExp; factor: number }[] = [
        // Meters: "500m", "500 m", "500 meters", "500 metrov"
        {
            pattern: /(\d+(?:[.,]\d+)?)\s*(m(?:eters?|etrov)?)\b/gi,
            factor: 1
        },
        // Kilometers: "5km", "5 km", "5 kilometers", "5 kilometrov"
        {
            pattern: /(\d+(?:[.,]\d+)?)\s*(km|kilometers?|kilometrov?)\b/gi,
            factor: 1000
        },
        // Miles: "3mi", "3 miles", "3 mile", "3 míle", "3 míľ"
        {
            pattern: /(\d+(?:[.,]\d+)?)\s*(mi(?:les?)?|míle?|míľ)\b/gi,
            factor: 1609.34
        }
    ];

    // --- Extract and convert radius ---
    for (const { pattern, factor } of unitPatterns) {
        const match = pattern.exec(query);
        if (match) {
            // Normalize decimal separator: "1,5" → "1.5"
            const numStr = match[1].replace(",", ".");
            const value = parseFloat(numStr);

            if (!isNaN(value) && value > 0) {
                detectedRadius = Math.round(value * factor); // Convert to meters
                // Remove the radius substring from the query
                query = query.replace(match[0], " ").trim();
                console.log(`[SearchIntent] Detected radius: ${value} × ${factor} = ${detectedRadius}m`);
                break; // Only process first match
            }
        }
    }

    // --- Detect superlatives (quality modifiers) ---
    const superlativePatterns = [
        // English
        /\b(best|amazing|incredible|fantastic|top.?tier|premium|excellent|perfect|outstanding)\b/gi,
        // Slovak
        /\b(najlepš[íia]|úžasn[áéýy]|skvel[áéýy]|perfektn[áéýy]|výborn[áéýy]|super|top)\b/gi
    ];

    const hasSuperlative = superlativePatterns.some(p => p.test(query));

    // --- Clean up the keyword ---
    // Remove common filler phrases (English & Slovak)
    const fillerPatterns = [
        /\b(i want|i need|give me|show me|find me|looking for)\b/gi,
        /\b(chcem|potrebujem|daj mi|ukáž mi|nájdi mi|hľadám)\b/gi,
        /\b(from me|near me|close to me|nearby)\b/gi,
        /\b(odo mňa|blízko mňa|v okolí|v blízkosti)\b/gi,
        /\b(make it|make them)\b/gi,
        /\b(nech je to|urob to)\b/gi,
        /\b(one ever|in my life|of all time)\b/gi,
        /\b(v živote|aké som mal|zo všetkých)\b/gi
    ];

    let cleanKeyword = query;
    for (const filler of fillerPatterns) {
        cleanKeyword = cleanKeyword.replace(filler, " ");
    }

    // Normalize whitespace
    cleanKeyword = cleanKeyword.replace(/\s+/g, " ").trim();

    console.log(`[SearchIntent] Raw: "${rawQuery}" → Clean: "${cleanKeyword}", Radius: ${detectedRadius}m, Superlative: ${hasSuperlative}`);

    return {
        cleanKeyword,
        detectedRadius,
        hasSuperlative,
        rawQuery
    };
}

// =============================================================================
// STEP 1: LIGHT CANDIDATE DISCOVERY (Cheap Fields Only)
// =============================================================================

interface LightDiscoveryResult {
    candidates: LightCandidate[];
    isPioneer: boolean; // True ONLY if 100% of data came from Google (no cache)
    source: "firestore" | "google" | "hybrid";
    discardedCandidates?: LightCandidate[];
}

// Imports for Cached Places
import { getCache } from "@/lib/cache-utils";
import { getNearbyGridKeys, PlacesCacheEntry } from "@/types/cached-places";

/**
 * Pre-enrichment filtering - removes unsuitable restaurants BEFORE expensive AI scoring
 * 
 * Filters:
 * - Permanently/temporarily closed businesses
 * - Price level outside user budget
 * - Non-restaurant types (gas stations, lodging, etc.)
 * 
 * @param candidates - Raw light candidates from discovery
 * @param userBudget - User budget preference ('low' | 'medium' | 'high' | 'any')
 * @returns Filtered candidates suitable for enrichment
 */
function filterLightCandidates(
    candidates: LightCandidate[],
    userBudget: string
): { filtered: LightCandidate[]; removed: number } {
    const startCount = candidates.length;

    // Budget -> Price Level mapping
    const budgetRanges: Record<string, number[]> = {
        'low': [1, 2],        // Inexpensive to Moderate
        'medium': [2, 3],     // Moderate to Expensive
        'high': [3, 4],       // Expensive to Very Expensive
        'any': [1, 2, 3, 4]   // All ranges
    };

    const allowedPriceLevels = budgetRanges[userBudget] || budgetRanges['any'];

    // Non-restaurant types to exclude
    const excludedTypes = new Set([
        'gas_station',
        'lodging',
        'car_rental',
        'car_wash',
        'parking',
        'store',
        'supermarket',
        'convenience_store'
    ]);

    const filtered = candidates.filter(candidate => {
        // Filter 1: Remove closed businesses
        if (candidate.businessStatus === 'CLOSED_PERMANENTLY' ||
            candidate.businessStatus === 'CLOSED_TEMPORARILY') {
            console.log(`[PreFilter] ❌ Closed: ${candidate.name} (${candidate.businessStatus})`);
            return false;
        }

        // Filter 2: Price level check (only if available from cache)
        if (candidate.priceLevel !== undefined && userBudget !== 'any') {
            if (!allowedPriceLevels.includes(candidate.priceLevel)) {
                console.log(`[PreFilter] ❌ Price mismatch: ${candidate.name} (Level ${candidate.priceLevel}, Budget: ${userBudget})`);
                return false;
            }
        }

        // Filter 3: Exclude non-restaurant types
        const hasExcludedType = candidate.types.some(type => excludedTypes.has(type));
        if (hasExcludedType) {
            console.log(`[PreFilter] ❌ Non-restaurant: ${candidate.name} (${candidate.types.join(', ')})`);
            return false;
        }

        return true;
    });

    const removed = startCount - filtered.length;
    if (removed > 0) {
        console.log(`[PreFilter] Removed ${removed}/${startCount} unsuitable candidates`);
    }

    return { filtered, removed };
}

/**
 * Stage 1: Discover up to 20 candidates with LIGHT fields only.
 * STRICT RADIUS: Uses locationRestriction (not locationBias) + Haversine post-filter.
 * NO AUTO-EXPANSION: If only 1 result in 200m, return 1 result.
 * 
 * CACHE STRATEGY: 
 * 1. Check Unified Grid Cache (fast, coarse)
 * 2. Check Firestore Geohash (flexible radius)
 * 3. Fallback to Google API
 */
async function findLightCandidates(
    lat: number,
    lng: number,
    radius: number,
    keyword: string
): Promise<LightDiscoveryResult> {
    const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    if (!GOOGLE_API_KEY) throw new Error("Missing NEXT_PUBLIC_GOOGLE_MAPS_KEY");

    const candidates: LightCandidate[] = [];
    const isPioneer = false;
    let source: "firestore" | "google" | "hybrid" = "firestore";
    const existingIds = new Set<string>();

    // =========================================================================
    // STEP 1: Check restaurants/ cache via geohash (Cache-first!)
    // =========================================================================
    console.log(`[Stage1] Light discovery for: "${keyword}" at (${lat}, ${lng}) radius ${radius}m`);

    const cachedRestaurants = await getCachedRestaurantsByLocation(lat, lng, 20);
    let geohashHits = 0;

    for (const restaurant of cachedRestaurants) {
        const distance = haversineDistance(
            lat, lng,
            restaurant.details.geometry.location.lat,
            restaurant.details.geometry.location.lng
        );

        if (distance <= radius) {
            // Keyword filter
            if (keyword) {
                const name = restaurant.details.name.toLowerCase();
                const types = restaurant.details.types.join(" ").toLowerCase();
                const k = keyword.toLowerCase();
                if (!name.includes(k) && !types.includes(k)) continue;
            }

            candidates.push({
                place_id: restaurant.placeId,
                name: restaurant.details.name,
                types: restaurant.details.types,
                rating: restaurant.details.rating,
                userRatingCount: restaurant.details.userRatingCount,
                location: restaurant.details.geometry.location,
                distance,
                priceLevel: mapPriceLevelToNumber(restaurant.details.priceLevel),
                businessStatus: restaurant.details.businessStatus,
                currentOpeningHours: restaurant.details.openingHours ? {
                    openNow: restaurant.details.openingHours.openNow,
                    weekdayDescriptions: restaurant.details.openingHours.weekdayDescriptions
                } : undefined
            });
            existingIds.add(restaurant.placeId);
            geohashHits++;
        }
    }

    console.log(`[Light] Geohash cache: ${geohashHits} hits`);

    // =========================================================================
    // STEP 2: Check Unified Grid Cache (v2) for additional coverage
    // =========================================================================
    try {
        const gridKeys = getNearbyGridKeys(lat, lng, radius);
        console.log(`[Light] Checking ${gridKeys.length} grid keys for cache hit...`);

        // Parallel fetch of grid cells
        const gridPromises = gridKeys.map(key => getCache<PlacesCacheEntry>("places_grid_cache", key));
        const gridResults = await Promise.all(gridPromises);

        // Track which grid keys are covered by cache
        const coveredKeys = new Set<string>();
        let gridHitCount = 0;

        for (let i = 0; i < gridResults.length; i++) {
            const entry = gridResults[i];
            const key = gridKeys[i];

            if (!entry) continue;

            // Mark this grid key as covered
            coveredKeys.add(key);

            for (const place of entry.places) {
                if (existingIds.has(place.place_id)) continue;

                // Haversine Check
                const distance = haversineDistance(
                    lat, lng,
                    place.geometry.location.lat,
                    place.geometry.location.lng
                );

                if (distance <= radius) {
                    // Keyword Filter
                    if (keyword) {
                        const name = place.basic_info.name.toLowerCase();
                        const types = place.basic_info.types.join(" ").toLowerCase();
                        const k = keyword.toLowerCase();
                        if (!name.includes(k) && !types.includes(k)) continue;
                    }

                    candidates.push({
                        place_id: place.place_id,
                        name: place.basic_info.name,
                        types: place.basic_info.types,
                        rating: place.basic_info.rating,
                        userRatingCount: place.basic_info.user_ratings_total,
                        location: place.geometry.location,
                        distance
                    });
                    existingIds.add(place.place_id);
                    gridHitCount++;
                }
            }
        }

        const totalCacheHits = geohashHits + gridHitCount;

        if (totalCacheHits > 0) {
            console.log(`[Light] Total cache hits: ${totalCacheHits} (${geohashHits} geohash + ${gridHitCount} grid)`);
            source = "firestore";

            // Sort by distance
            candidates.sort((a, b) => (a.distance || 0) - (b.distance || 0));

            // If we have enough candidates, return early
            if (candidates.length >= BATCH_SIZE) {
                console.log(`[Light] Sufficient cache hits (${candidates.length}). No Google API needed!`);
                return {
                    candidates: candidates.slice(0, BATCH_SIZE),
                    isPioneer: false,
                    source: "firestore",
                    discardedCandidates: []
                };
            }
        }

    } catch (err) {
        console.warn("[Light] Cache check failed (non-fatal):", err);
    }

    // =========================================================================
    // STEP 3: Adaptive Google API Fetch (only remaining count needed)
    // =========================================================================
    const remaining = BATCH_SIZE - candidates.length;

    if (remaining > 0) {
        console.log(`[Light] Need ${remaining} more. Fetching from Google Places API (STRICT radius ${radius}m)...`);
        source = candidates.length > 0 ? "hybrid" : "google";

        let endpoint = "https://places.googleapis.com/v1/places:searchNearby";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const requestBody: any = {
            maxResultCount: Math.min(remaining, 20) // Adaptive fetch - only what we need!
        };

        // CRITICAL FIX: searchText uses locationBias (supports circle)
        // searchNearby uses locationRestriction (also supports circle)
        // Both have Haversine post-filter for STRICT enforcement

        // Google API max radius is 50km - cap it for API call, but keep original for post-filter
        const apiRadius = Math.min(radius, 50000);
        if (radius > 50000) {
            console.log(`[Light] User requested ${radius}m, but Google API max is 50km. Using 50km for API, ${radius}m for post-filter.`);
        }

        if (keyword) {
            endpoint = "https://places.googleapis.com/v1/places:searchText";
            requestBody.textQuery = keyword;
            if (lat !== 0 && lng !== 0) {
                // searchText: Use locationBias (locationRestriction only supports rectangle)
                requestBody.locationBias = {
                    circle: { center: { latitude: lat, longitude: lng }, radius: apiRadius }
                };
            }
        } else {
            requestBody.includedTypes = ["restaurant"];
            // searchNearby: locationRestriction with circle is valid
            requestBody.locationRestriction = {
                circle: { center: { latitude: lat, longitude: lng }, radius: apiRadius }
            };
        }

        const googleRes = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": GOOGLE_API_KEY,
                "X-Goog-FieldMask": LIGHT_FIELD_MASK
            },
            body: JSON.stringify(requestBody)
        });

        if (!googleRes.ok) {
            const errorText = await googleRes.text();
            console.error(`[Light] Google API error: ${googleRes.status}`, errorText);
            // Return what we have from Firestore if Google fails
            if (candidates.length > 0) {
                return { candidates, isPioneer, source: "firestore" };
            }
            throw new Error(`Google Places API error: ${googleRes.status}`);
        }

        const googleData = await googleRes.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const googlePlaces: any[] = googleData.places || [];

        // =====================================================================
        // AGGRESSIVE CACHING: Save ALL places BEFORE filtering by radius
        // This maximizes ROI on expensive Google API calls
        // =====================================================================

        console.log(`[Light] Received ${googlePlaces.length} places from Google, caching ALL...`);

        // Cache ALL Google results to restaurants/ for future searches
        const cachePromises = googlePlaces.map(async (place) => {
            try {
                await saveRestaurantToCache(place.id, place, undefined);
            } catch (saveErr) {
                console.warn(`[Light] Failed to cache ${place.id}:`, saveErr);
            }
        });

        // Fire and forget caching - don't block response
        Promise.all(cachePromises).then(() => {
            console.log(`[Light] Cached ${googlePlaces.length} places for future searches`);
        }).catch(err => console.error("[Light] Cache promise error:", err));

        // Now filter by user's strict radius
        const existingIds = new Set(candidates.map(c => c.place_id));
        let addedCount = 0;

        // Store candidates that were just outside radius to use as fallback (Smart Decision)
        const discardedCandidates: LightCandidate[] = [];
        // Limit discarded candidates to avoid memory issues, we only need top 3 closest
        const MAX_DISCARDED = 5;

        for (const place of googlePlaces) {
            if (existingIds.has(place.id)) continue;
            if (addedCount >= remaining) break;

            const placeLat = place.location?.latitude || 0;
            const placeLng = place.location?.longitude || 0;
            const distance = haversineDistance(lat, lng, placeLat, placeLng);

            // STRICT POST-FILTER: Only include if ACTUALLY within user's radius
            if (distance > radius) {
                // console.log(`[Light] Discarding ${place.displayName?.text} - ${Math.round(distance)}m > ${radius}m`);
                if (discardedCandidates.length < MAX_DISCARDED) {
                    discardedCandidates.push({
                        place_id: place.id,
                        name: place.displayName?.text || "Unknown",
                        types: place.types || [],
                        rating: place.rating,
                        userRatingCount: place.userRatingCount,
                        location: { lat: placeLat, lng: placeLng },
                        distance
                    });
                }
                continue;
            }

            candidates.push({
                place_id: place.id,
                name: place.displayName?.text || "Unknown",
                types: place.types || [],
                rating: place.rating,
                userRatingCount: place.userRatingCount,
                location: { lat: placeLat, lng: placeLng },
                distance
            });
            existingIds.add(place.id);
            addedCount++;
        }

        // Sort discarded by distance to find the absolute closest "misses"
        discardedCandidates.sort((a, b) => (a.distance || 0) - (b.distance || 0));

        console.log(`[Light] Added ${addedCount} to results. Discarded ${discardedCandidates.length} potential fallbacks.`);

        // SMART FALLBACK: If Strict Search yielded 0 results, but we have valid Discarded candidates
        // Return them immediately as a "Decision Point" without extra API calls.
        if (candidates.length === 0 && discardedCandidates.length > 0) {
            console.log(`[Light] 0 strict results, but found ${discardedCandidates.length} nearby. Triggering Smart Fallback.`);
            // We can just return these formatted as if they came from 'findSurvivalCandidate'
            // But the caller expects 'candidates' array.
            // Actually, we want to trigger DECISION_REQUIRED in the POST handler.
            // We can pass them back via a new property in the return type.
            return { candidates, isPioneer, source, discardedCandidates };
        }
    }

    // NO AUTO-EXPANSION: Return whatever we found, even if < 20
    console.log(`[Light] Final: ${candidates.length} candidates within ${radius}m (no expansion)`);
    return { candidates, isPioneer, source };
}

/**
 * Survival Search: Finds the single nearest place ignoring restrictive radius.
 * Used when standard search returns 0 results to offer a "Decision Point".
 */
async function findSurvivalCandidate(lat: number, lng: number): Promise<LightCandidate | null> {
    const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    if (!GOOGLE_API_KEY) return null;

    console.log(`[Survival] Searching for nearest place (any radius)...`);

    const endpoint = "https://places.googleapis.com/v1/places:searchNearby";
    const requestBody = {
        maxResultCount: 1,
        includedTypes: ["restaurant"],
        rankPreference: "DISTANCE",
        locationRestriction: {
            circle: {
                center: { latitude: lat, longitude: lng },
                radius: 50000 // 50km max for "survival"
            }
        }
    };

    try {
        const res = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": GOOGLE_API_KEY,
                "X-Goog-FieldMask": LIGHT_FIELD_MASK
            },
            body: JSON.stringify(requestBody)
        });

        if (!res.ok) {
            console.warn(`[Survival] API Error: ${res.status}`);
            return null;
        }

        const data = await res.json();
        const places = data.places || [];

        if (places.length > 0) {
            const p = places[0];
            const dist = haversineDistance(lat, lng, p.location.latitude, p.location.longitude);
            console.log(`[Survival] Found: ${p.displayName?.text} at ${Math.round(dist)}m`);

            // Note: Place will be cached when getPlaceDetails is called during enrichment

            return {
                place_id: p.id,
                name: p.displayName?.text || "Unknown",
                types: p.types || [],
                rating: p.rating,
                userRatingCount: p.userRatingCount,
                location: { lat: p.location.latitude, lng: p.location.longitude },
                distance: dist
            };
        }
    } catch (err) {
        console.error("[Survival] Failed:", err);
    }
    return null;
}


// =============================================================================
// STEP 2: DATA ENRICHMENT
// =============================================================================

// Smart cache-first enrichment with light→rich upgrade logic
// Uses getCachedRestaurantsByLocation() for proximity queries

interface EnrichedPlace extends PlaceWithContext {
    imageSrc: string | null;
    formatted_address?: string;
    geometry: { location: { lat: number; lng: number } };
    user_ratings_total?: number;
    editorialSummary?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reviews?: any[];
    websiteUri?: string;
}

/**
 * Helper to map Restaurant -> EnrichedPlace for Gemini
 */
function mapToEnrichedPlaces(restaurants: Restaurant[]): EnrichedPlace[] {
    return restaurants.map(r => ({
        place_id: r.placeId,
        name: r.details.name,
        location: r.details.geometry.location,
        types: r.details.types,
        rating: r.details.rating,
        price_level: mapPriceLevelToNumber(r.details.priceLevel),
        vicinity: r.details.address,
        formatted_address: r.details.formattedAddress || r.details.address,
        geometry: r.details.geometry,
        user_ratings_total: r.details.userRatingCount,
        imageSrc: resolveRestaurantImage(r),
        editorialSummary: r.details.editorialSummary,
        reviews: r.details.reviews || [],
        websiteUri: r.details.website,
        servesVegetarianFood: r.details.types.includes("vegetarian_restaurant") ||
            r.details.types.includes("vegan_restaurant")
    }));
}

// Helper to handle price level mapping
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPriceLevelToNumber(priceLevel: any): number | undefined {
    if (typeof priceLevel === 'number') return priceLevel;
    if (priceLevel === 'PRICE_LEVEL_INEXPENSIVE') return 1;
    if (priceLevel === 'PRICE_LEVEL_MODERATE') return 2;
    if (priceLevel === 'PRICE_LEVEL_EXPENSIVE') return 3;
    if (priceLevel === 'PRICE_LEVEL_VERY_EXPENSIVE') return 4;
    return undefined;
}
// =============================================================================

interface SearchTransaction {
    results: EnrichedPlace[];
    credits: {
        remaining: number;
        limit: number;
        used: number;
        tier: "free" | "premium";
    };
    geminiSuccess: boolean;
    pioneerBonus: boolean;
}

/**
 * Execute search transaction: deduct credit, score with Gemini, return TOP 5.
 * @param rawQuery - Original user query for AI context
 * @param hasSuperlative - Whether user requested "best", "amazing" etc.
 */
async function executeSearchTransaction(
    userId: string,
    candidates: EnrichedPlace[],
    userPreferences: UserPreferences,
    keyword: string,
    isPioneer: boolean,
    rawQuery: string = "",
    hasSuperlative: boolean = false
): Promise<SearchTransaction> {
    const db = getAdminDb();
    const userRef = db.collection("users").doc(userId);

    // --- Reserve credit first ---
    const reservation = await reserveUserCredit(userId);

    if (!reservation.authorized) {
        throw { status: 402, message: "Monthly limit reached", code: "LIMIT_REACHED" };
    }

    let geminiSuccess = true;
    let scoredResults = candidates;

    // --- Run Gemini Scoring with RAW query for context ---
    // If user used superlatives, Gemini will prioritize high-quality results
    const queryForGemini = rawQuery || keyword;
    console.log(`[Search] Gemini context: "${queryForGemini}", Superlative mode: ${hasSuperlative}`);

    try {
        const scoresMap = await scorePlacesWithDeepContext(
            candidates,
            {
                ...userPreferences,
                hasSuperlative,  // Pass to Gemini for quality-first ranking
                rawQuery: queryForGemini
            },
            queryForGemini
        );

        if (scoresMap.size > 0) {
            scoredResults = candidates
                .map((p) => ({
                    ...p,
                    ai_score: scoresMap.get(p.place_id)
                }))
                .filter((p) => p.ai_score && !p.ai_score.safetyFlag) // Remove unsafe
                .sort((a, b) => (b.ai_score?.matchScore || 0) - (a.ai_score?.matchScore || 0));
        }
    } catch (error) {
        console.error("[Search] Gemini scoring failed:", error);
        geminiSuccess = false;

        // --- REFUND CREDIT on Gemini failure ---
        try {
            await refundUserCredit(userId);
            console.log(`[Search] Refunded credit for user ${userId} due to Gemini failure`);
        } catch (refundErr) {
            console.error("[Search] Failed to refund credit:", refundErr);
        }
    }

    // --- DISCOVERY BONUS (Anti-Farming Protected) ---
    // Bonus ONLY given when:
    // 1. isPioneer === true (ALL data came from Google, zero cache hits)
    // 2. Gemini scoring succeeded
    // If even 1 result came from cache, isPioneer = false, no bonus!
    let pioneerBonus = false;
    console.log(`[Search] Discovery check: isPioneer=${isPioneer}, geminiSuccess=${geminiSuccess}`);
    if (isPioneer && geminiSuccess) {
        try {
            await db.runTransaction(async (transaction) => {
                const userDoc = await transaction.get(userRef);
                if (userDoc.exists) {
                    const userData = userDoc.data()!;
                    const credits: UserCredits = userData.credits || { remaining: 0, used: 0, limit: 5, resetDate: new Date().toISOString() };

                    // Only give bonus to free users
                    if (userData.tier !== "premium") {
                        transaction.update(userRef, {
                            "credits.remaining": credits.remaining + 2,
                            "credits.limit": Math.max(credits.limit, credits.remaining + 2),
                            updatedAt: new Date().toISOString()
                        });
                        pioneerBonus = true;
                        console.log(`[Search] 🎉 Pioneer bonus: +2 credits for user ${userId}`);
                    }
                }
            });
        } catch (err) {
            console.warn("[Search] Failed to grant pioneer bonus:", err);
        }
    }

    // --- Fetch final credit state ---
    const finalUserDoc = await userRef.get();
    const finalData = finalUserDoc.data();
    const finalCredits = finalData?.credits || { remaining: 0, used: 0, limit: 5 };
    const finalTier = finalData?.tier || "free";

    return {
        results: scoredResults.slice(0, TOP_RESULTS),
        credits: {
            remaining: geminiSuccess ? (pioneerBonus ? finalCredits.remaining : reservation.remaining) : finalCredits.remaining,
            limit: finalCredits.limit,
            used: finalCredits.used,
            tier: finalTier
        },
        geminiSuccess,
        pioneerBonus
    };
}

// =============================================================================
// TIERED LOGIC HELPERS (The Fork)
// =============================================================================

/**
 * Check if user has credits available (Premium or remaining > 0).
 * This is called BEFORE expensive AI/Enrichment operations to prevent leaks.
 */
async function checkUserHasCredits(userId: string | null): Promise<{
    hasCredits: boolean;
    tier: 'free' | 'premium' | 'guest';
    remaining: number;
    limit: number;
    used: number;
}> {
    if (!userId) {
        return { hasCredits: false, tier: 'guest', remaining: 0, limit: 0, used: 0 };
    }

    try {
        const db = getAdminDb();
        const userDoc = await db.collection("users").doc(userId).get();

        if (!userDoc.exists) {
            // New user - they get free credits
            return { hasCredits: true, tier: 'free', remaining: 5, limit: 5, used: 0 };
        }

        const userData = userDoc.data()!;
        const tier: 'free' | 'premium' = userData.tier || 'free';
        const credits = userData.credits || { remaining: 5, used: 0, limit: 5 };

        // Premium users always have credits
        if (tier === 'premium') {
            return { hasCredits: true, tier: 'premium', remaining: -1, limit: -1, used: credits.used || 0 };
        }

        // Free users: check remaining
        const hasCredits = credits.remaining > 0;
        return {
            hasCredits,
            tier: 'free',
            remaining: credits.remaining,
            limit: credits.limit || 5,
            used: credits.used || 0
        };
    } catch (error) {
        console.error("[checkUserHasCredits] Error:", error);
        // On error, deny access to be safe
        return { hasCredits: false, tier: 'free', remaining: 0, limit: 5, used: 0 };
    }
}

/**
 * Map a LightCandidate to a Place-compatible structure for Basic results.
 * These results lack photos and AI scores but are still usable.
 */
function mapLightCandidateToPlace(candidate: LightCandidate): {
    place_id: string;
    name: string;
    types: string[];
    rating?: number;
    user_ratings_total?: number;
    geometry: { location: { lat: number; lng: number } };
    formatted_address: string;
    vicinity: string;
    imageSrc: string;
    isGeneric: boolean;
    dataLevel: 'light';
    distance?: number;
} {
    return {
        place_id: candidate.place_id,
        name: candidate.name,
        types: candidate.types,
        rating: candidate.rating,
        user_ratings_total: candidate.userRatingCount,
        geometry: { location: candidate.location },
        formatted_address: "",  // Not available in light data
        vicinity: "",           // Not available in light data
        imageSrc: "/placeholder-restaurant.jpg",  // Generic fallback
        isGeneric: true,        // Flag for frontend to show upgrade CTA
        dataLevel: 'light',
        distance: candidate.distance
    };
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

interface UserPreferences {
    allergies: string[];
    dietary: string[];
    cuisines: string[];
    budget: string;
}

export async function GET(request: NextRequest) {
    try {
        // --- 0. Environment Check ---
        const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
        if (!GOOGLE_API_KEY) throw new Error("MISSING ENV VAR: NEXT_PUBLIC_GOOGLE_MAPS_KEY");

        // --- 1. Rate Limiting & Authentication & User Profile ---
        // Moved Auth UP so we can use Tier for Rate Limiting

        const ip = request.headers.get("x-forwarded-for") || "unknown_ip";
        let rateLimitIdentifier = `ip_${ip}`;
        let rateLimitConfig = RATE_LIMITS.SEARCH.GUEST;

        let userId: string | null = null;
        let userPreferences: UserPreferences = {
            allergies: [],
            dietary: [],
            cuisines: [],
            budget: "any"
        };

        const authHeader = request.headers.get("Authorization");
        if (authHeader?.startsWith("Bearer ")) {
            try {
                const token = authHeader.split("Bearer ")[1];
                const decodedToken = await getAdminAuth().verifyIdToken(token);
                userId = decodedToken.uid;
                rateLimitIdentifier = `user_${userId}`;

                // Fetch User Profile
                const userDoc = await getAdminDb().collection("users").doc(userId).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();

                    // preferences
                    const prefs = userData?.preferences || userData?.profile?.preferences;
                    if (prefs) {
                        userPreferences = {
                            allergies: Array.isArray(prefs.allergies) ? prefs.allergies : (prefs.allergies ? [prefs.allergies] : []),
                            dietary: Array.isArray(prefs.dietary) ? prefs.dietary : [],
                            cuisines: Array.isArray(prefs.cuisines) ? prefs.cuisines : [],
                            budget: prefs.budget || "any"
                        };
                    }

                    // tier logic for rate limit
                    const tier = userData?.subscription?.tier || 'free';
                    if (['premium', 'basic', 'pro', 'enterprise'].includes(tier)) {
                        rateLimitConfig = RATE_LIMITS.SEARCH.PREMIUM;
                    } else {
                        rateLimitConfig = RATE_LIMITS.SEARCH.FREE;
                    }
                }
            } catch (authErr) {
                console.warn("[Search] Invalid Token or Auth Error:", authErr);
            }
        }

        // Apply Rate Limit
        const { limitReached, reset } = await checkRateLimit(rateLimitIdentifier, rateLimitConfig);
        if (limitReached) {
            console.warn(`[RateLimit] ⚠️ 429 Hit: ${rateLimitIdentifier}`);
            return NextResponse.json({
                error: "Rate limit exceeded. Please try again later.",
                code: "RATE_LIMIT_EXCEEDED",
                reset: new Date(reset).toISOString()
            }, {
                status: 429,
                headers: { 'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString() }
            });
        }

        // --- 1. Parse Request Parameters ---
        // --- 1. Parse Request Parameters (Input Validation) ---
        const { searchParams } = new URL(request.url);

        // ✅ NEW: Zod Validation
        const SearchQuerySchema = z.object({
            lat: z.coerce.number().min(-90).max(90),
            lng: z.coerce.number().min(-180).max(180),
            radius: z.coerce.number().min(100).max(50000).default(5000),
            keyword: z.string().max(100).regex(/^[a-zA-Z0-9\s\-\.,!áčďéíľňóšťúýžÁČĎÉÍĽŇÓŠŤÚÝŽ]*$/, "Invalid characters in keyword").optional()
        });

        const validation = SearchQuerySchema.safeParse({
            lat: searchParams.get("lat"),
            lng: searchParams.get("lng"),
            radius: searchParams.get("radius"),
            keyword: searchParams.get("keyword")
        });

        if (!validation.success) {
            console.error("[Search] Validation failed:", validation.error);
            return NextResponse.json({
                error: "Invalid search parameters",
                details: validation.error.format()
            }, { status: 400 });
        }

        const { lat, lng, radius: validatedRadius } = validation.data;
        let radius = validatedRadius; // Can be overridden by NLP
        const rawKeyword = validation.data.keyword || "";

        // --- 1b. Parse Natural Language Search Intent ---
        const searchIntent = parseSearchIntent(rawKeyword);
        const keyword = searchIntent.cleanKeyword; // Clean keyword for Google

        // Apply detected radius from query (e.g., "pizza 3 miles from me")
        if (searchIntent.detectedRadius !== null) {
            radius = searchIntent.detectedRadius;
            console.log(`[Search] Using radius from query: ${radius}m`);
        }

        // ... (User preferences fetched above) ...
        // Duplicated logic removed.


        // =========================================================================
        // THREE-STAGE AI FUNNEL
        // =========================================================================

        // --- STAGE 1: Light Discovery (20 candidates, cheap fields) ---
        console.log(`[Stage1] Light discovery for: "${keyword}" at (${lat}, ${lng}) radius ${radius}m`);
        const { candidates: lightCandidates, isPioneer, source, discardedCandidates } = await findLightCandidates(lat, lng, radius, keyword);

        if (lightCandidates.length === 0) {
            console.log(`[Stage1] 0 results found. Checking fallbacks...`);

            let survivalOption = null;

            // SMART FALLBACK: Check if we have "discarded" candidates from Light Search (just outside radius)
            // This avoids a second expensive API call to 'searchNearby'
            if (discardedCandidates && discardedCandidates.length > 0) {
                const bestAlternative = discardedCandidates[0];
                console.log(`[Search] Smart Fallback found: ${bestAlternative.name} (${Math.round(bestAlternative.distance || 0)}m away)`);
                survivalOption = bestAlternative;
            } else {
                // Traditional Survival Search (Heavy API Call) - Only if really needed
                survivalOption = await findSurvivalCandidate(lat, lng);
            }
            const status = await checkUserHasCredits(userId);

            if (survivalOption) {
                // Calculate new radius (rounded up to nearest 500m)
                // e.g. distance 3200m -> 3500m or 4000m? Let's add padding.
                const dist = survivalOption.distance || 0;
                const newRadius = Math.ceil((dist + 1000) / 500) * 500; // Add 1km buffer

                return NextResponse.json({
                    status: 'DECISION_REQUIRED',
                    results: [],
                    credits: {
                        remaining: status.remaining,
                        limit: status.limit,
                        used: status.used,
                        tier: status.tier
                    },
                    message: "No restaurants found in your immediate area.",
                    choices: {
                        survivalOption: {
                            id: survivalOption.place_id,
                            name: survivalOption.name,
                            rating: survivalOption.rating,
                            distance: survivalOption.distance,
                            reason: `This is the closest open restaurant we could find (${(dist / 1000).toFixed(1)}km away).`
                        },
                        expandOption: {
                            label: `Expand search to ${(newRadius / 1000).toFixed(1)}km`,
                            newRadius: newRadius
                        }
                    }
                });
            }

            // If truly NOTHING even in 50km:
            return NextResponse.json({
                status: 'ZERO_RESULTS',
                results: [],
                credits: {
                    remaining: status.remaining,
                    limit: status.limit,
                    used: status.used,
                    tier: status.tier
                },
                source: "empty",
                message: `No restaurants found within ${radius}m.`
            });
        }

        console.log(`[Stage1] Found ${lightCandidates.length} light candidates`);

        // =========================================================================
        // THE FORK: Premium vs. Basic Decision Gate
        // CRITICAL: This check MUST happen BEFORE any expensive operations (Scout, Enrich)
        // =========================================================================
        const creditCheck = await checkUserHasCredits(userId);
        console.log(`[Search] User ${userId || 'guest'} mode: ${creditCheck.hasCredits ? 'PREMIUM' : 'BASIC'} (tier: ${creditCheck.tier}, remaining: ${creditCheck.remaining})`);

        if (!creditCheck.hasCredits) {
            // =====================================================================
            // BASIC BRANCH: Return Light Data Only (0 credits deducted)
            // NO Scout, NO Enrichment, NO Gemini costs
            // =====================================================================
            console.log(`[BasicBranch] Returning ${lightCandidates.length} light results (no AI, no photos)`);

            // Sort by rating (desc) then distance (asc) for best UX without AI
            const sortedCandidates = [...lightCandidates].sort((a, b) => {
                const ratingDiff = (b.rating || 0) - (a.rating || 0);
                if (ratingDiff !== 0) return ratingDiff;
                return (a.distance || 0) - (b.distance || 0);
            });

            // Map to Place-compatible format and take top 20
            const basicResults = sortedCandidates
                .slice(0, 20)
                .map(mapLightCandidateToPlace);

            return NextResponse.json({
                results: basicResults,
                credits: {
                    remaining: creditCheck.remaining,
                    limit: creditCheck.limit,
                    used: creditCheck.used,
                    tier: creditCheck.tier
                },
                source,
                dataLevel: 'light',
                message: creditCheck.tier === 'guest'
                    ? "Sign in to unlock AI-powered personalized recommendations!"
                    : "Monthly limit reached. Showing basic results without AI scoring."
            });
        }

        // =========================================================================
        // PREMIUM BRANCH: Full AI Pipeline (continues below)
        // User has credits - proceed with Scout, Enrich, and Gemini scoring
        // =========================================================================
        console.log(`[PremiumBranch] Proceeding with AI pipeline...`);

        // --- PRE-ENRICHMENT FILTER: Remove unsuitable restaurants BEFORE AI ---
        // Filters closed, price mismatches, non-restaurants to reduce Gemini costs
        const filterResult = filterLightCandidates(lightCandidates, userPreferences.budget);
        const filteredCandidates = filterResult.filtered;

        if (filteredCandidates.length === 0) {
            console.warn(`[PreFilter] All ${lightCandidates.length} candidates filtered out!`);
            return NextResponse.json({
                status: 'ZERO_RESULTS',
                results: [],
                credits: {
                    remaining: creditCheck.remaining,
                    limit: creditCheck.limit,
                    used: creditCheck.used,
                    tier: creditCheck.tier
                },
                source,
                message: "No suitable restaurants found matching your preferences."
            });
        }

        console.log(`[PreFilter] Using ${filteredCandidates.length} filtered candidates for AI pipeline`);

        // --- STAGE 2: AI Scout (Select top 6 with dietary awareness) ---
        const scoutProfile = {
            ...userPreferences,
            hasSuperlative: searchIntent.hasSuperlative
        };

        const scoutResult = await scoutTopCandidates(filteredCandidates, keyword, scoutProfile);
        console.log(`[Stage2] Scout: ${scoutResult.perfectMatches.length} perfect, survival=${scoutResult.isSurvivalMode}`);

        // Configurable Peek Ahead distance (default +2km)
        const PEEK_AHEAD_DISTANCE = 2000; // meters

        // =======================================================================
        // DECISION REQUIRED MODE (No Perfect Matches - User Chooses Next Step)
        // =======================================================================
        if (scoutResult.isSurvivalMode && scoutResult.survivalOption) {
            console.log(`[DecisionMode] No perfect matches. Returning decision point with survival: ${scoutResult.survivalOption.id}`);

            // Find the light candidate data for the survival option (NO enrichment!)
            const survivalLight = filteredCandidates.find(c => c.place_id === scoutResult.survivalOption!.id);

            // Fetch user credits without deducting (just for display)
            let userCredits = { remaining: 0, limit: 0, used: 0, tier: "guest" };
            if (userId) {
                try {
                    const userDoc = await getAdminDb().collection("users").doc(userId).get();
                    if (userDoc.exists) {
                        const userData = userDoc.data();
                        userCredits = {
                            remaining: userData?.credits?.remaining ?? 0,
                            limit: userData?.credits?.limit ?? 5,
                            used: userData?.credits?.used ?? 0,
                            tier: userData?.subscription?.tier ?? "free"
                        };
                    }
                } catch (e) {
                    console.warn("[DecisionMode] Failed to fetch user credits:", e);
                }
            }

            // Build DECISION_REQUIRED response (NO API costs yet!)
            const decisionResponse: DecisionRequiredResponse = {
                status: "DECISION_REQUIRED",
                message: `No exact match found within ${radius}m.`,
                choices: {
                    survivalOption: survivalLight ? {
                        id: survivalLight.place_id,
                        name: survivalLight.name,
                        rating: survivalLight.rating,
                        distance: survivalLight.distance,
                        reason: scoutResult.survivalOption.reason
                    } : null,
                    expandOption: {
                        label: `Search for exact match (+${PEEK_AHEAD_DISTANCE / 1000}km)`,
                        newRadius: radius + PEEK_AHEAD_DISTANCE
                    }
                },
                credits: userCredits,
                source
            };

            console.log(`[DecisionMode] Returning decision point. No credits deducted.`);
            return NextResponse.json(decisionResponse);
        }

        // =======================================================================
        // NORMAL MODE (Perfect Matches Found)
        // =======================================================================
        let winnerIds = scoutResult.perfectMatches;

        if (winnerIds.length === 0) {
            // Fallback: use filtered candidates if scout returns nothing
            console.warn("[Stage2] Scout returned empty, using all filtered candidates");
            winnerIds = filteredCandidates.map(c => c.place_id).slice(0, SCOUT_TOP_N);
        }

        // --- 5. Enrich Winners (Stage 3) ---
        // Smart cache-first enrichment with light→rich upgrade logic
        const enrichedRestaurants = await getEnrichedRestaurants(winnerIds);

        // Map to EnrichedPlace for transaction handler
        const enrichedCandidates = mapToEnrichedPlaces(enrichedRestaurants);
        console.log(`[Search] Enriched ${enrichedCandidates.length} winners`);

        // --- 6. Execute Transaction (Cost & Scoring) ---
        if (userId) {
            try {
                const transaction = await executeSearchTransaction(
                    userId,
                    enrichedCandidates,
                    userPreferences,
                    keyword,
                    isPioneer,
                    searchIntent.rawQuery,      // Raw query for Gemini context
                    searchIntent.hasSuperlative // Quality preference flag
                );

                // Build response
                const response: SearchResponse = {
                    results: transaction.results,
                    credits: transaction.credits,
                    source,
                    pioneerBonus: transaction.pioneerBonus
                };

                if (!transaction.geminiSuccess) {
                    response.geminiError = "Oops! Gemini stabbed us in the back. Here's your credit back! 🔄";
                }

                if (isPioneer && transaction.pioneerBonus) {
                    response.pioneerMessage = "🎉 Congratulations! You're the first to explore this area with NearSpotty! +2 bonus credits!";
                }

                return NextResponse.json(response);

            } catch (err: unknown) {
                // Handle 402 specifically
                if (typeof err === "object" && err !== null && "status" in err && (err as { status: number }).status === 402) {
                    return NextResponse.json({
                        error: (err as { message?: string }).message || "Monthly limit reached",
                        code: "LIMIT_REACHED",
                        mode: "free",
                        tier: "free"
                    }, { status: 402 });
                }
                throw err;
            }
        }

        // --- 6. Unauthenticated: Return basic results without AI ---
        return NextResponse.json({
            results: enrichedCandidates.slice(0, TOP_RESULTS),
            credits: { remaining: 0, limit: 0, used: 0, tier: "guest" },
            source,
            message: "Sign in to unlock AI-powered personalized recommendations!"
        });

    } catch (error: unknown) {
        console.error("🔥 CRITICAL SEARCH ERROR:", error);
        const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({
            error: errorMessage,
            code: "CRITICAL_FAILURE",
            stack: process.env.NODE_ENV === "development" && error instanceof Error ? error.stack : undefined
        }, { status: 500 });
    }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

interface SearchResponse {
    status?: "PERFECT_MATCH" | "PARTIAL_MATCH";
    results: EnrichedPlace[];
    credits: {
        remaining: number;
        limit: number;
        used: number;
        tier: string;
    };
    source: string;
    pioneerBonus?: boolean;
    pioneerMessage?: string;
    geminiError?: string;
    message?: string;
    smartSuggestion?: SmartSuggestion;
}

interface SmartSuggestion {
    found: boolean;
    placeName: string;
    placeId: string;
    distance: number;
    actionPayload: { radius: number };
}

/**
 * Response when no perfect dietary matches found.
 * User must choose: use survival option OR expand search radius.
 * NO credits deducted until user makes a choice.
 */
interface DecisionRequiredResponse {
    status: "DECISION_REQUIRED";
    message: string;
    choices: {
        survivalOption: {
            id: string;
            name: string;
            rating?: number;
            distance?: number;
            reason: string;
        } | null;
        expandOption: {
            label: string;
            newRadius: number;
        };
    };
    credits: {
        remaining: number;
        limit: number;
        used: number;
        tier: string;
    };
    source: string;
}


/**
 * Haversine formula to calculate distance between two coordinates.
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(deg: number): number {
    return deg * (Math.PI / 180);
}

// End of file cleanup

