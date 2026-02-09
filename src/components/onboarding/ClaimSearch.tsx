"use client";

import { useState, useRef, useEffect } from "react";
import { Search, Loader2, MapPin } from "lucide-react";
import loader from "@/lib/google-maps";
import { Input } from "@/components/ui/input";

interface PlaceSuggestion {
    placeId: string;
    mainText: string;
    secondaryText: string;
}

interface ClaimSearchProps {
    onSelect: (place: { placeId: string; name: string; address: string; location: { lat: number; lng: number } }) => void;
    initialValue?: string;
    city?: string;
}

export function ClaimSearch({ onSelect, initialValue = "", city = "" }: ClaimSearchProps) {
    const [inputValue, setInputValue] = useState(initialValue);
    const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
    const [loading, setLoading] = useState(false);
    const [placesReady, setPlacesReady] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const debounceRef = useRef<NodeJS.Timeout | null>(null);
    const sessionTokenRef = useRef<string | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Initialize Places Logic
    const [PlaceClass, setPlaceClass] = useState<typeof google.maps.places.Place | null>(null);

    useEffect(() => {
        loader.importLibrary<google.maps.PlacesLibrary>("places").then((lib) => {
            setPlaceClass(() => lib.Place);
            sessionTokenRef.current = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
            setPlacesReady(true);
        }).catch(err => console.error("Failed to load places lib", err));
    }, []);

    // Outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSearch = (query: string) => {
        setInputValue(query);
        if (debounceRef.current) clearTimeout(debounceRef.current);

        if (!query.trim()) {
            setSuggestions([]);
            setIsOpen(false);
            return;
        }

        setIsOpen(true);
        setLoading(true);

        debounceRef.current = setTimeout(async () => {
            try {
                // Construct query with city bias if available
                const finalQuery = city ? `${query}, ${city}` : query;

                const sessionToken = sessionTokenRef.current || Date.now().toString();
                const params = new URLSearchParams();
                params.append("input", finalQuery);
                params.append("sessionToken", sessionToken);
                // "establishment" helps filter, but broad search with city is safer for finding specific branches
                params.append("types", "establishment");

                const res = await fetch(`/api/places/autocomplete?${params.toString()}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.suggestions) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        setSuggestions(data.suggestions.map((s: any) => ({
                            placeId: s.placePrediction.placeId,
                            mainText: s.placePrediction.structuredFormat?.mainText?.text || s.placePrediction.text?.text,
                            secondaryText: s.placePrediction.structuredFormat?.secondaryText?.text || ""
                        })));
                    }
                }
            } catch (error) {
                console.error("Search failed", error);
            } finally {
                setLoading(false);
            }
        }, 300);
    };

    const handleSelect = async (suggestion: PlaceSuggestion) => {
        if (!placesReady || !PlaceClass) return;
        setLoading(true);

        try {
            // Fetch validation details (lat/lng/address)
            const place = new PlaceClass({ id: suggestion.placeId });
            await place.fetchFields({ fields: ['location', 'displayName', 'formattedAddress'] });

            if (place.location) {
                onSelect({
                    placeId: suggestion.placeId,
                    name: place.displayName || suggestion.mainText,
                    address: place.formattedAddress || suggestion.secondaryText,
                    location: {
                        lat: place.location.lat(),
                        lng: place.location.lng()
                    }
                });
                setInputValue(place.displayName || suggestion.mainText);
                setIsOpen(false);
            }
        } catch (error) {
            console.error("Details fetch failed", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative w-full" ref={wrapperRef}>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                    value={inputValue}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder="Search for your restaurant..."
                    className="pl-9 pr-4"
                />
                {loading && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />
                )}
            </div>

            {isOpen && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                    {suggestions.map((item) => (
                        <button
                            key={item.placeId}
                            onClick={() => handleSelect(item)}
                            className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-start gap-3 transition-colors border-b last:border-0"
                        >
                            <MapPin className="h-4 w-4 text-gray-400 mt-1 shrink-0" />
                            <div>
                                <div className="font-medium text-sm text-gray-900">{item.mainText}</div>
                                <div className="text-xs text-gray-500">{item.secondaryText}</div>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
