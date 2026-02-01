"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, Search, Loader2, Database } from "lucide-react";
import loader from "@/lib/google-maps";
import { getCitySuggestionsFromCache, saveCityToCache, CachedCity } from "@/lib/city-cache";

interface LocationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectLocation: (location: { lat: number; lng: number; name: string; placeId?: string }) => void;
    onRetryGPS: () => void;
    /** If true, hide the GPS retry button (already failed) */
    hideGPSRetry?: boolean;
}

/** Suggestion from new AutocompleteSuggestion API */
interface PlaceSuggestion {
    placeId: string;
    mainText: string;
    secondaryText: string;
    fullText: string;
}

/**
 * LocationModal - Global city search using Places Autocomplete
 * 
 * Shown when GPS geolocation fails, allowing users to:
 * 1. Search for ANY city worldwide via Places Autocomplete
 * 2. Retry enabling GPS location services (if not already failed)
 */
/**
 * Default city fallback when GPS fails
 */
const DEFAULT_CITY = {
    name: "Bratislava",
    fullName: "Bratislava, Slovakia",
    lat: 48.1486,
    lng: 17.1077,
};

export default function LocationModal({
    isOpen,
    onClose,
    onSelectLocation,
    onRetryGPS,
    hideGPSRetry = false
}: LocationModalProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
    const [cachedResults, setCachedResults] = useState<CachedCity[]>([]);
    const [loading, setLoading] = useState(false);
    const [placesReady, setPlacesReady] = useState(false);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);
    const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

    // Initialize Places library (new API)
    useEffect(() => {
        if (!isOpen) return;

        const initPlaces = async () => {
            try {
                await loader.importLibrary("places");
                // Create a session token for billing optimization
                sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
                setPlacesReady(true);
            } catch (error) {
                console.error("[LocationModal] Failed to load Places library:", error);
            }
        };

        initPlaces();
    }, [isOpen]);

    // Debounced search for city predictions - CACHE-FIRST strategy
    const handleSearch = useCallback(async (query: string) => {
        setSearchQuery(query);

        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        if (!query.trim()) {
            setSuggestions([]);
            setCachedResults([]);
            return;
        }

        debounceRef.current = setTimeout(async () => {
            setLoading(true);

            // STEP 1: Check Firestore cache first
            try {
                const cached = await getCitySuggestionsFromCache(query, 5);
                if (cached.length > 0) {
                    setCachedResults(cached);
                    setSuggestions([]); // Clear Google results when we have cache
                    setLoading(false);
                    console.log("[LocationModal] Found cached cities:", cached.length);
                    return;
                }
            } catch (cacheError) {
                console.error("[LocationModal] Cache lookup failed:", cacheError);
            }

            // STEP 2: Fall back to Google Places API using new AutocompleteSuggestion API
            if (placesReady) {
                try {
                    const request: google.maps.places.AutocompleteRequest = {
                        input: query,
                        includedPrimaryTypes: ["locality", "administrative_area_level_1"],
                        sessionToken: sessionTokenRef.current || undefined,
                    };

                    const { suggestions: autoSuggestions } = await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);

                    setCachedResults([]); // Clear cache results
                    const mappedSuggestions: PlaceSuggestion[] = autoSuggestions
                        .filter(s => s.placePrediction)
                        .map(s => ({
                            placeId: s.placePrediction!.placeId,
                            mainText: s.placePrediction!.mainText?.text || "",
                            secondaryText: s.placePrediction!.secondaryText?.text || "",
                            fullText: s.placePrediction!.text?.text || "",
                        }));

                    setSuggestions(mappedSuggestions);
                } catch (error) {
                    console.error("[LocationModal] AutocompleteSuggestion error:", error);
                    setSuggestions([]);
                }
            }
            setLoading(false);
        }, 300);
    }, [placesReady]);

    // Handle city selection from Google - get coordinates using new Place class and CACHE the result
    const handleSelectCity = useCallback(async (suggestion: PlaceSuggestion) => {
        if (!placesReady) return;

        setLoading(true);
        try {
            // Use new Place class with fetchFields
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

                // CACHE the city for future lookups
                await saveCityToCache({
                    name: cityName,
                    fullName,
                    lat,
                    lng,
                    country: countryComponent?.longText || undefined,
                    placeId: suggestion.placeId,
                });

                // Reset session token after successful selection (billing optimization)
                sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();

                onSelectLocation({ lat, lng, name: cityName, placeId: suggestion.placeId });
                onClose();
                setSearchQuery("");
                setSuggestions([]);
                setCachedResults([]);
            }
        } catch (error) {
            console.error("[LocationModal] Place.fetchFields error:", error);
        } finally {
            setLoading(false);
        }
    }, [placesReady, onSelectLocation, onClose]);

    // Handle city selection from CACHE (no API call needed)
    const handleSelectCachedCity = useCallback((city: CachedCity) => {
        onSelectLocation({
            lat: city.lat,
            lng: city.lng,
            name: city.name,
            placeId: city.placeId
        });
        onClose();
        setSearchQuery("");
        setSuggestions([]);
        setCachedResults([]);
        console.log("[LocationModal] Selected cached city:", city.name);
    }, [onSelectLocation, onClose]);

    const handleRetryGPS = () => {
        onRetryGPS();
        onClose();
    };

    /**
     * Handle default city fallback
     */
    const handleUseDefaultCity = () => {
        onSelectLocation({
            lat: DEFAULT_CITY.lat,
            lng: DEFAULT_CITY.lng,
            name: DEFAULT_CITY.name,
            placeId: "ChIJl2HKCjaJbEcRaEOI_Yi3d1w" // Bratislava Place ID (optional but good for caching)
        });
        onClose();
        setSearchQuery("");
        setSuggestions([]);
        setCachedResults([]);
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <MapPin className="h-5 w-5 text-primary" />
                        Where are you?
                    </DialogTitle>
                    <DialogDescription>
                        {hideGPSRetry
                            ? "Location services unavailable. Please search for your city below."
                            : "We couldn't detect your location automatically. Search for your city or enable location services."
                        }
                    </DialogDescription>
                </DialogHeader>



                <div className="space-y-4 py-4">
                    {/* City Search Input */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search for a city..."
                            value={searchQuery}
                            onChange={(e) => handleSearch(e.target.value)}
                            className="pl-10"
                            autoFocus
                        />
                        {loading && (
                            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                    </div>

                    {/* Cached City Results (shown first) */}
                    {cachedResults.length > 0 && (
                        <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
                            <div className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-medium flex items-center gap-1">
                                <Database className="h-3 w-3" /> Cached Results
                            </div>
                            {cachedResults.map((city) => (
                                <button
                                    key={city.id}
                                    onClick={() => handleSelectCachedCity(city)}
                                    className="w-full px-4 py-3 text-left hover:bg-muted transition-colors flex items-center gap-3"
                                >
                                    <MapPin className="h-4 w-4 text-emerald-600 shrink-0" />
                                    <div>
                                        <div className="font-medium">{city.name}</div>
                                        <div className="text-sm text-muted-foreground">{city.fullName}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Google Places Suggestions (new API) */}
                    {suggestions.length > 0 && (
                        <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
                            {suggestions.map((suggestion) => (
                                <button
                                    key={suggestion.placeId}
                                    onClick={() => handleSelectCity(suggestion)}
                                    className="w-full px-4 py-3 text-left hover:bg-muted transition-colors flex items-center gap-3"
                                >
                                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <div>
                                        <div className="font-medium">
                                            {suggestion.mainText}
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            {suggestion.secondaryText}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* No results message */}
                    {searchQuery && !loading && suggestions.length === 0 && cachedResults.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-2">
                            No cities found. Try a different search.
                        </p>
                    )}

                    {/* Show GPS retry section only if not hidden */}
                    {!hideGPSRetry && (
                        <>
                            {/* Divider */}
                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-background px-2 text-muted-foreground">or</span>
                                </div>
                            </div>

                            {/* Quick Actions */}
                            <div className="flex gap-2">
                                {/* Default City Fallback */}
                                <Button
                                    variant="secondary"
                                    className="flex-1"
                                    onClick={handleUseDefaultCity}
                                >
                                    <MapPin className="mr-2 h-4 w-4" />
                                    Use {DEFAULT_CITY.name}
                                </Button>

                                {/* Enable GPS Button */}
                                <Button
                                    variant="outline"
                                    className="flex-1"
                                    onClick={handleRetryGPS}
                                >
                                    <MapPin className="mr-2 h-4 w-4" />
                                    Retry GPS
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
