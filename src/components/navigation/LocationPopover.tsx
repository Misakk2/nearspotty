"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MapPin, X, Loader2, Navigation, Search as SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import loader from "@/lib/google-maps";
import { getCitySuggestionsFromCache, saveCityToCache, CachedCity } from "@/lib/city-cache";

interface LocationPopoverProps {
    selectedCity: { name: string; lat: number; lng: number } | null;
    onSelectCity: (city: { name: string; lat: number; lng: number; placeId: string }) => void;
    onUseGPS: () => void;
    onClear: () => void;
    isLoadingGPS?: boolean;
    openDirection?: "up" | "down";
}

/** Suggestion from new AutocompleteSuggestion API (matching LocationModal) */
interface PlaceSuggestion {
    placeId: string;
    mainText: string;
    secondaryText: string;
    fullText: string;
}

/**
 * Location Popover with Google Places Autocomplete (Modern API)
 * Reuses logic from LocationModal regarding Places API V2 and Caching.
 */
export function LocationPopover({
    selectedCity,
    onSelectCity,
    onUseGPS,
    onClear,
    isLoadingGPS = false,
    openDirection = "down"
}: LocationPopoverProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [inputValue, setInputValue] = useState("");
    const [unifiedSuggestions, setUnifiedSuggestions] = useState<(PlaceSuggestion & { source: 'cache' | 'api', cachedData?: CachedCity })[]>([]);
    const [loading, setLoading] = useState(false);
    const [placesReady, setPlacesReady] = useState(false);

    const inputRef = useRef<HTMLInputElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);
    const sessionTokenRef = useRef<string | null>(null);

    // Initialize Places library (new API)
    useEffect(() => {
        if (!isOpen) return;

        const initPlaces = async () => {
            try {
                await loader.importLibrary("places");
                // Create a session token (simple UUID-like string)
                sessionTokenRef.current = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
                setPlacesReady(true);
            } catch (error) {
                console.error("[LocationPopover] Failed to load Places library:", error);
            }
        };

        initPlaces();

        // Focus input slightly after open
        setTimeout(() => inputRef.current?.focus(), 50);

    }, [isOpen]);

    // Close on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        }

        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
            return () => document.removeEventListener("mousedown", handleClickOutside);
        }
    }, [isOpen]);

    // Handle Search implementation (Copied from LocationModal logic)
    const handleSearch = useCallback(async (query: string) => {
        setInputValue(query);

        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        if (!query.trim()) {
            setUnifiedSuggestions([]);
            return;
        }

        debounceRef.current = setTimeout(async () => {
            setLoading(true);

            // STEP 1: Fetch Cache
            let cached: CachedCity[] = [];
            try {
                cached = await getCitySuggestionsFromCache(query, 3);
            } catch (error) {
                console.error("Cache error", error);
            }

            // STEP 2: Fetch API (via Server Proxy)
            let apiSuggestions: PlaceSuggestion[] = [];
            try {
                const sessionToken = sessionTokenRef.current ?
                    // Using timestamp for proxy session token (simple fallback)
                    Date.now().toString() : undefined;

                const params = new URLSearchParams();
                params.append("input", query);
                if (sessionToken) params.append("sessionToken", sessionToken);

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
                                mainText: s.placePrediction.structuredFormat?.mainText?.text || s.placePrediction.text?.text || "",
                                secondaryText: s.placePrediction.structuredFormat?.secondaryText?.text || "",
                                fullText: s.placePrediction.text?.text || "",
                            }));
                    }
                }
            } catch (e) {
                console.error("[LocationPopover] Autocomplete Proxy Error:", e);
            }

            // MERGE
            const combined: (PlaceSuggestion & { source: 'cache' | 'api', cachedData?: CachedCity })[] = [];

            // Add Cache First
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

            // Add API (dedupe)
            apiSuggestions.forEach(s => {
                if (!combined.find(c => c.placeId === s.placeId)) {
                    combined.push({ ...s, source: 'api' });
                }
            });

            setUnifiedSuggestions(combined);
            setLoading(false);
        }, 300);
    }, []);

    // Handle city selection (API)
    const handleSelectCitySuggestion = useCallback(async (suggestion: PlaceSuggestion) => {
        if (!placesReady) return;

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

                const countryComponent = place.addressComponents?.find(
                    comp => comp.types.includes("country")
                );

                // CACHE
                await saveCityToCache({
                    name: cityName,
                    fullName,
                    lat: place.location.lat(),
                    lng: place.location.lng(),
                    country: countryComponent?.longText || "",
                    placeId: suggestion.placeId,
                });

                // Reset session
                sessionTokenRef.current = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();

                onSelectCity({ name: cityName, lat, lng, placeId: suggestion.placeId });
                setIsOpen(false);
                setInputValue("");
            }
        } catch (error) {
            console.error("[LocationPopover] Place.fetchFields error:", error);
        } finally {
            setLoading(false);
        }
    }, [placesReady, onSelectCity]);

    // Handle cached selection
    const handleSelectCachedCity = useCallback((city: CachedCity) => {
        onSelectCity({
            lat: city.lat,
            lng: city.lng,
            name: city.name,
            placeId: city.placeId || ""
        });
        setIsOpen(false);
        setInputValue("");
    }, [onSelectCity]);

    const handleUseGPS = () => {
        onUseGPS();
        setIsOpen(false);
    };

    const handleClear = () => {
        onClear();
    };

    return (
        <div className="relative" ref={popoverRef}>
            {/* Trigger Button */}
            <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(!isOpen)}
                className="h-8 px-3 gap-1.5 text-xs font-bold hover:bg-primary/10 rounded-full border border-gray-200"
            >
                <MapPin className="h-3.5 w-3.5 text-primary" />
                <span className="max-w-[100px] truncate">
                    {selectedCity ? selectedCity.name : "Near Me"}
                </span>
                {selectedCity && (
                    <X
                        className="h-3 w-3 ml-1 hover:text-red-500 cursor-pointer"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleClear();
                        }}
                    />
                )}
            </Button>

            {/* Popover Content */}
            {isOpen && (
                <div
                    className={`absolute left-0 w-80 bg-white rounded-xl shadow-xl border border-gray-100 p-3 z-50 animate-in fade-in slide-in-from-${openDirection === 'up' ? 'bottom' : 'top'}-2 ${openDirection === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'
                        }`}
                >
                    <div className="space-y-3">

                        {/* GPS Button */}
                        <button
                            onClick={handleUseGPS}
                            disabled={isLoadingGPS}
                            className="w-full flex items-center gap-2 p-2.5 bg-primary/5 hover:bg-primary/10 rounded-lg transition-colors text-left"
                        >
                            {isLoadingGPS ? (
                                <Loader2 className="h-4 w-4 text-primary animate-spin" />
                            ) : (
                                <Navigation className="h-4 w-4 text-primary" />
                            )}
                            <span className="text-sm font-medium text-primary">
                                {isLoadingGPS ? "Getting location..." : "Use my current location"}
                            </span>
                        </button>

                        <div className="flex items-center gap-2 text-xs text-gray-400">
                            <div className="flex-1 h-px bg-gray-200" />
                            <span>or search city</span>
                            <div className="flex-1 h-px bg-gray-200" />
                        </div>

                        {/* City Search Input */}
                        <div className="relative">
                            <input
                                ref={inputRef}
                                type="text"
                                value={inputValue}
                                onChange={(e) => handleSearch(e.target.value)}
                                placeholder="Search for a city..."
                                className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            />
                            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            {loading && (
                                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-primary" />
                            )}
                        </div>

                        {/* Suggestions List */}
                        {unifiedSuggestions.length > 0 && (
                            <div className="max-h-60 overflow-y-auto border rounded-lg divide-y divide-gray-50 mt-1">
                                {unifiedSuggestions.map((suggestion) => (
                                    <button
                                        key={suggestion.placeId}
                                        onClick={() => {
                                            if (suggestion.source === 'cache' && suggestion.cachedData) {
                                                handleSelectCachedCity(suggestion.cachedData);
                                            } else {
                                                handleSelectCitySuggestion(suggestion);
                                            }
                                        }}
                                        className="w-full px-3 py-2.5 text-left hover:bg-gray-50 transition-colors flex items-center gap-2.5"
                                    >
                                        <MapPin className={`h-3.5 w-3.5 shrink-0 ${suggestion.source === 'cache' ? 'text-emerald-600' : 'text-gray-400'}`} />
                                        <div className="overflow-hidden">
                                            <div className="font-medium text-sm truncate text-gray-900">
                                                {suggestion.mainText}
                                            </div>
                                            <div className="text-xs text-gray-500 truncate">
                                                {suggestion.secondaryText}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {inputValue && !loading && unifiedSuggestions.length === 0 && (
                            <p className="text-xs text-center text-gray-400 py-2">No cities found</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
