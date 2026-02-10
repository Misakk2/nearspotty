/**
 * Shared city autocomplete hook
 * Consolidates duplicate logic from LocationModal and LocationPopover
 * 
 * Features:
 * - Cache-first strategy (Firestore city cache)
 * - Google Places Autocomplete API fallback
 * - Automatic deduplication and merging
 * - Debounced search (300ms)
 * - Session token management for billing optimization
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { getCitySuggestionsFromCache, saveCityToCache, type CachedCity } from "@/lib/city-cache";
import loader from "@/lib/google-maps";

export interface PlaceSuggestion {
    placeId: string;
    mainText: string;
    secondaryText: string;
    fullText: string;
}

export interface UnifiedSuggestion extends PlaceSuggestion {
    source: 'cache' | 'api';
    cachedData?: CachedCity;
}

export interface SelectedCity {
    name: string;
    lat: number;
    lng: number;
    placeId: string;
}

interface UseCityAutocompleteOptions {
    /** Whether the component is currently active/open */
    isActive: boolean;
    /** Called when a city is successfully selected */
    onCitySelected: (city: SelectedCity) => void;
    /** Use server-side proxy for autocomplete API calls (default: false, uses direct Google API) */
    useProxy?: boolean;
}

export function useCityAutocomplete({
    isActive,
    onCitySelected,
    useProxy = false
}: UseCityAutocompleteOptions) {
    const [inputValue, setInputValue] = useState("");
    const [suggestions, setSuggestions] = useState<UnifiedSuggestion[]>([]);
    const [loading, setLoading] = useState(false);
    const [placesReady, setPlacesReady] = useState(false);

    const debounceRef = useRef<NodeJS.Timeout | null>(null);
    const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | string | null>(null);

    // Initialize Google Places library when component becomes active
    useEffect(() => {
        if (!isActive) return;

        const initPlaces = async () => {
            try {
                await loader.importLibrary("places");

                // Create session token (proper object for direct API, string for proxy)
                if (useProxy) {
                    sessionTokenRef.current = crypto.randomUUID?.() || Date.now().toString();
                } else {
                    sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
                }

                setPlacesReady(true);
            } catch (error) {
                console.error("[useCityAutocomplete] Failed to load Places library:", error);
            }
        };

        initPlaces();
    }, [isActive, useProxy]);

    /**
     * Debounced search handler - fetches from cache and Google API
     */
    const handleSearch = useCallback(async (query: string) => {
        setInputValue(query);

        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        if (!query.trim()) {
            setSuggestions([]);
            return;
        }

        debounceRef.current = setTimeout(async () => {
            setLoading(true);

            // STEP 1: Fetch from Firestore cache
            let cached: CachedCity[] = [];
            try {
                cached = await getCitySuggestionsFromCache(query, 5);
            } catch (error) {
                console.error("[useCityAutocomplete] Cache error:", error);
            }

            // STEP 2: Fetch from Google Places API
            let apiSuggestions: PlaceSuggestion[] = [];

            if (useProxy) {
                // Use server-side proxy route
                try {
                    const params = new URLSearchParams();
                    params.append("input", query);
                    if (sessionTokenRef.current) {
                        params.append("sessionToken", sessionTokenRef.current.toString());
                    }

                    const res = await fetch(`/api/places/autocomplete?${params.toString()}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.suggestions) {
                            apiSuggestions = data.suggestions
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                .filter((s: any) => s.placePrediction)
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                .map((s: any) => ({
                                    placeId: s.placePrediction.placeId,
                                    mainText: s.placePrediction.structuredFormat?.mainText?.text ||
                                        s.placePrediction.text?.text || "",
                                    secondaryText: s.placePrediction.structuredFormat?.secondaryText?.text || "",
                                    fullText: s.placePrediction.text?.text || "",
                                }));
                        }
                    }
                } catch (error) {
                    console.error("[useCityAutocomplete] Proxy API error:", error);
                }
            } else if (placesReady) {
                // Use direct Google Maps API
                try {
                    const request: google.maps.places.AutocompleteRequest = {
                        input: query,
                        includedPrimaryTypes: ["locality", "administrative_area_level_1"],
                        sessionToken: sessionTokenRef.current as google.maps.places.AutocompleteSessionToken || undefined,
                    };

                    const { suggestions: autoSuggestions } =
                        await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);

                    apiSuggestions = autoSuggestions
                        .filter(s => s.placePrediction)
                        .map(s => ({
                            placeId: s.placePrediction!.placeId,
                            mainText: s.placePrediction!.mainText?.text || "",
                            secondaryText: s.placePrediction!.secondaryText?.text || "",
                            fullText: s.placePrediction!.text?.text || "",
                        }));
                } catch (error) {
                    console.error("[useCityAutocomplete] Direct API error:", error);
                }
            }

            // STEP 3: Merge and deduplicate results
            const combined: UnifiedSuggestion[] = [];

            // Add cached results first (prioritized)
            cached.forEach(c => {
                combined.push({
                    placeId: c.placeId || "",
                    mainText: c.name,
                    secondaryText: c.country || c.fullName || "",
                    fullText: c.fullName,
                    source: 'cache',
                    cachedData: c
                });
            });

            // Add API results (deduplicated)
            apiSuggestions.forEach(s => {
                if (!combined.find(c => c.placeId === s.placeId)) {
                    combined.push({ ...s, source: 'api' });
                }
            });

            setSuggestions(combined);
            setLoading(false);
        }, 300);
    }, [placesReady, useProxy]);

    /**
     * Select a city from API suggestions - fetches coordinates and saves to cache
     */
    const selectCity = useCallback(async (suggestion: PlaceSuggestion) => {
        if (!placesReady) {
            console.warn("[useCityAutocomplete] Places library not ready");
            return;
        }

        setLoading(true);
        try {
            const place = new google.maps.places.Place({
                id: suggestion.placeId,
            });

            await place.fetchFields({
                fields: ["location", "displayName", "addressComponents"],
            });

            if (place.location) {
                const cityName = suggestion.mainText || place.displayName || "Selected Location";
                const fullName = suggestion.fullText || cityName;
                const lat = place.location.lat();
                const lng = place.location.lng();

                // Extract country from address components
                const countryComponent = place.addressComponents?.find(
                    comp => comp.types.includes("country")
                );

                // Save to cache for future lookups
                await saveCityToCache({
                    name: cityName,
                    fullName,
                    lat,
                    lng,
                    country: countryComponent?.longText || "",
                    placeId: suggestion.placeId,
                });

                // Reset session token for billing optimization
                if (useProxy) {
                    sessionTokenRef.current = crypto.randomUUID?.() || Date.now().toString();
                } else {
                    sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
                }

                // Notify parent component
                onCitySelected({ name: cityName, lat, lng, placeId: suggestion.placeId });

                // Clear state
                setInputValue("");
                setSuggestions([]);
            }
        } catch (error) {
            console.error("[useCityAutocomplete] Place.fetchFields error:", error);
        } finally {
            setLoading(false);
        }
    }, [placesReady, onCitySelected, useProxy]);

    /**
     * Select a city from cache - no API call needed
     */
    const selectCachedCity = useCallback((city: CachedCity) => {
        onCitySelected({
            lat: city.lat,
            lng: city.lng,
            name: city.name,
            placeId: city.placeId || ""
        });

        setInputValue("");
        setSuggestions([]);
    }, [onCitySelected]);

    /**
     * Clear current search
     */
    const clearSearch = useCallback(() => {
        setInputValue("");
        setSuggestions([]);
    }, []);

    return {
        // State
        inputValue,
        suggestions,
        loading,
        placesReady,

        // Handlers
        handleSearch,
        selectCity,
        selectCachedCity,
        clearSearch,
    };
}
