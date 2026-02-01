"use client";
import Map from "@/components/search/map";
import ProtectedRoute from "@/components/protected-route";
import RoleGuard from "@/components/RoleGuard";
import PlaceCard from "@/components/search/place-card";
import { PlaceCardSkeleton } from "@/components/search/PlaceCardSkeleton";
import LocationModal from "@/components/search/LocationModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Place } from "@/types/place";
import { Search, MapPin, Loader2, Sparkles, UtensilsCrossed, Wine, Coffee } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import { useAuth } from "@/components/auth-provider";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { UserPreferences, GeminiScore } from "@/types";
import Link from "next/link";
import CategoryGrid from "@/components/search/CategoryGrid";
import { APP_CATEGORIES } from "@/config/categories";
import { useSubscriptionSync } from "@/hooks/useSubscriptionSync";
import { useSearchState } from "@/hooks/useSearchState";

// Score map type for storing scores by place_id
type ScoreMap = Record<string, GeminiScore>;

export default function SearchPage() {
    const { user } = useAuth();
    const [searchQuery, setSearchQuery] = useState("");
    const [places, setPlaces] = useState<Place[]>([]);
    const [loading, setLoading] = useState(false);
    const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
    // Using 'any' for markers since AdvancedMarkerElement type varies across library versions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const markers = useRef<any[]>([]);
    const [preferences, setPreferences] = useState<UserPreferences | null>(null);

    // AI Scoring state
    const [scores, setScores] = useState<ScoreMap>({});
    const [scoringLoading, setScoringLoading] = useState(false);
    const [limitReached, setLimitReached] = useState(false);
    const [subscriptionTier, setSubscriptionTier] = useState<'free' | 'premium'>('free');
    const [remainingScans, setRemainingScans] = useState(5);

    // Location state
    const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
    const [center, setCenter] = useState({ lat: 48.1486, lng: 17.1077 }); // Default: Bratislava
    const [cityId, setCityId] = useState<string | null>("ChIJl2HKCjaJbEcRaEOI_Yi3d1w"); // Default to Bratislava ID
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | undefined>(undefined); // For Blue Dot
    const [locationModalOpen, setLocationModalOpen] = useState(false);
    const [gpsAttempted, setGpsAttempted] = useState(false); // Track if GPS has been tried
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null); // Track selected category

    // Track if auto-initialization has run (prevents double-init)
    const hasAutoInitialized = useRef(false);

    // Sync subscription on mount
    useSubscriptionSync();

    // React Query state persistence
    const { state: cachedState, setPlaces: cacheSetPlaces, updateScores: cacheUpdateScores, setCategory: cacheSetCategory, saveScrollPosition, setLocation: cacheSetLocation } = useSearchState();

    // Restore state from React Query cache on mount (for back navigation)
    const hasRestored = useRef(false);
    useEffect(() => {
        if (!hasRestored.current && cachedState.places.length > 0) {
            hasRestored.current = true;
            console.log("[SearchPage] Restoring state from cache:", cachedState.places.length, "places");

            // Restore places and scores
            setPlaces(cachedState.places);
            setScores(cachedState.scores);
            setCenter(cachedState.center);
            if (cachedState.cityId) setCityId(cachedState.cityId);
            if (cachedState.selectedCategory) setSelectedCategory(cachedState.selectedCategory);

            // Restore scroll position after a brief delay for DOM to render
            if (cachedState.scrollPosition > 0) {
                setTimeout(() => {
                    const container = document.querySelector('[data-results-container]');
                    if (container) {
                        container.scrollTop = cachedState.scrollPosition;
                    }
                }, 100);
            }

            // Skip auto-init if restoring
            hasAutoInitialized.current = true;
        }
    }, [cachedState]);

    // Scroll to selected place
    useEffect(() => {
        if (selectedPlaceId) {
            const el = document.getElementById(`place-${selectedPlaceId}`);
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        }
    }, [selectedPlaceId]);

    // Fetch user preferences and subscription data
    useEffect(() => {
        const fetchUserData = async () => {
            if (user) {
                try {
                    console.log("[SearchPage] Fetching user data for:", user.uid);
                    // Fetch preferences
                    const prefRef = doc(db, "users", user.uid, "preferences", "main");
                    const prefSnap = await getDoc(prefRef);
                    if (prefSnap.exists()) {
                        const data = prefSnap.data() as UserPreferences;
                        console.log("[SearchPage] Preferences loaded:", data);
                        setPreferences(data);
                    } else {
                        console.warn("[SearchPage] Preferences missing!");
                        toast("Please complete your profile to enable AI scoring", { icon: "⚙️" });
                    }

                    // Fetch subscription tier and usage
                    const userRef = doc(db, "users", user.uid);
                    const userSnap = await getDoc(userRef);
                    if (userSnap.exists()) {
                        const data = userSnap.data();
                        const tier = data.tier || data.subscriptionTier || (data.plan === 'premium' ? 'premium' : 'free');
                        setSubscriptionTier(tier);

                        // Get AI usage
                        const usage = data.usage || data.aiUsage || { count: 0 };
                        const remaining = tier === 'premium' ? Infinity : Math.max(0, 5 - usage.count);
                        setRemainingScans(remaining);
                        setLimitReached(remaining === 0 && tier === 'free');
                        console.log(`[SearchPage] User Tier: ${tier}, Remaining: ${remaining}`);
                    }
                } catch (error) {
                    console.error("Error fetching user data:", error);
                }
            }
        };
        fetchUserData();
    }, [user]);

    const fetchPlaces = useCallback(async (location?: { lat: number; lng: number }, query?: string, cityIdOverride?: string) => {
        if (!user) {
            toast.error("Please log in to search");
            return;
        }

        setLoading(true);
        setSelectedPlaceId(null);
        try {
            // Get auth token for API request
            const token = await user.getIdToken();

            const params = new URLSearchParams();
            if (query) params.append("keyword", query);

            // Add City ID for caching
            const activeCityId = cityIdOverride || cityId;
            if (activeCityId) params.append("cityId", activeCityId);

            if (location) {
                params.append("lat", location.lat.toString());
                params.append("lng", location.lng.toString());
                params.append("radius", "5000"); // 5km default
            } else {
                // If no location provided, use current map center
                if (mapInstance) {
                    const c = mapInstance.getCenter();
                    if (c) {
                        params.append("lat", c.lat().toString());
                        params.append("lng", c.lng().toString());
                        params.append("radius", "5000");
                    }
                } else {
                    // Fallback to default center
                    params.append("lat", center.lat.toString());
                    params.append("lng", center.lng.toString());
                    params.append("radius", "5000");
                }
            }

            const res = await fetch(`/api/places/nearby?${params.toString()}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await res.json();

            // Handle subscription limit reached
            if (res.status === 402 || data.code === 'LIMIT_REACHED') {
                setLimitReached(true);
                setRemainingScans(0);
                toast.error("Monthly search limit reached. Upgrade to Premium!");
                return;
            }

            // Handle auth errors
            if (res.status === 401) {
                toast.error("Session expired. Please refresh the page.");
                return;
            }

            // Update usage info from response
            if (data.usage) {
                setRemainingScans(data.usage.remaining);
                setSubscriptionTier(data.usage.tier);
                if (data.usage.remaining === 0 && data.usage.tier === 'free') {
                    setLimitReached(true);
                }
            }

            if (data.results) {
                setPlaces(data.results);
                // Fit bounds if we have results
                if (mapInstance && data.results.length > 0) {
                    const bounds = new google.maps.LatLngBounds();
                    data.results.forEach((p: Place) => {
                        bounds.extend(p.geometry.location);
                    });
                    mapInstance.fitBounds(bounds);
                }
            } else if (data.status === 'ZERO_RESULTS') {
                toast("No places found nearby", { icon: "🔍" });
                setPlaces([]);
            } else {
                toast.error("No results found");
            }
        } catch (error) {
            console.error(error);
            toast.error("Failed to fetch places");
        } finally {
            setLoading(false);
        }
    }, [center, mapInstance, user]);

    /**
     * Auto-score places with AI when user has remaining scans.
     * Called automatically after places load.
     */
    const autoScorePlaces = useCallback(async (placesToScore: Place[]) => {
        if (!user) return;

        if (!preferences) {
            console.warn("[SearchPage] Skipping scoring: Preferences missing");
            return;
        }

        if (placesToScore.length === 0) return;

        if (limitReached) {
            console.warn("[SearchPage] Skipping scoring: Limit reached");
            return;
        }

        console.log(`[SearchPage] Scoring ${placesToScore.length} places...`);
        setScoringLoading(true);
        try {
            const response = await fetch('/api/gemini/batch-score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    places: placesToScore.slice(0, 10).map(p => ({
                        place_id: p.place_id,
                        name: p.name,
                        types: p.types || [],
                        rating: p.rating,
                        price_level: p.price_level,
                        vicinity: p.vicinity
                    })),
                    userProfile: preferences,
                    userId: user.uid
                })
            });

            const data = await response.json();

            if (data.limitReached) {
                setLimitReached(true);
                setRemainingScans(0);
                toast("AI scan limit reached. Upgrade to Premium for unlimited scans.", { icon: "🔒" });
                return;
            }

            if (data.results) {
                console.log(`[SearchPage] Received ${data.results.length} scores`);
                const newScores: ScoreMap = {};
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                data.results.forEach((r: { place_id: string; score: GeminiScore }) => {
                    newScores[r.place_id] = r.score;
                });
                setScores(prev => ({ ...prev, ...newScores }));

                // Update remaining scans
                if (data.usage?.remaining !== undefined) {
                    setRemainingScans(data.usage.remaining);
                }
            }
        } catch (error) {
            console.error("Auto-scoring error:", error);
            toast.error("AI Scoring failed");
        } finally {
            setScoringLoading(false);
        }
    }, [user, preferences, limitReached]);

    // Auto-score when places change (if user hasn't hit limit)
    useEffect(() => {
        if (places.length > 0 && !limitReached && preferences) {
            autoScorePlaces(places);
        }
    }, [places, limitReached, preferences, autoScorePlaces]);

    // Sync local state to React Query cache for persistence across navigation
    useEffect(() => {
        if (places.length > 0 && hasRestored.current) {
            cacheSetPlaces(places, scores);
        }
    }, [places, scores, cacheSetPlaces]);

    useEffect(() => {
        if (selectedCategory && hasRestored.current) {
            cacheSetCategory(selectedCategory);
        }
    }, [selectedCategory, cacheSetCategory]);

    useEffect(() => {
        if (center && hasRestored.current) {
            cacheSetLocation({ lat: center.lat, lng: center.lng, cityId: cityId || undefined });
        }
    }, [center, cityId, cacheSetLocation]);

    // Update map markers when places change - using AdvancedMarkerElement
    useEffect(() => {
        if (!mapInstance) return;

        // Clear old markers
        markers.current.forEach(m => {
            if (m && typeof m.map !== 'undefined') {
                m.map = null; // AdvancedMarkerElement cleanup
            }
        });
        markers.current = [];

        // Async IIFE to load marker library and create markers
        (async () => {
            try {
                const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker") as google.maps.MarkerLibrary;

                const newMarkers = places.map(place => {
                    // Create custom pin - can differentiate registered vs regular restaurants here
                    // TODO: Check if place is registered and use different color
                    const pin = new PinElement({
                        background: '#4285F4', // Google blue - change to #34A853 for registered
                        borderColor: '#2563EB',
                        glyphColor: '#FFFFFF',
                        scale: 1.0,
                    });

                    const marker = new AdvancedMarkerElement({
                        position: place.geometry.location,
                        map: mapInstance,
                        title: place.name,
                        content: pin.element,
                    });

                    marker.addListener("click", () => {
                        setSelectedPlaceId(place.place_id);
                    });

                    return marker;
                });

                markers.current = newMarkers;
            } catch (error) {
                console.error('[SearchPage] Failed to create AdvancedMarkers:', error);
            }
        })();
    }, [places, mapInstance]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchPlaces(undefined, searchQuery);
    };

    /**
     * Handle location request - GPS priority with modal fallback.
     * Shows LocationModal when GPS fails instead of automatic IP fallback.
     */
    const handleUseLocation = useCallback(async () => {
        if (!navigator.geolocation) {
            // No geolocation support - show modal
            setLocationModalOpen(true);
            return;
        }

        // Wrap geolocation in a promise for cleaner async handling
        const getDeviceLocation = (): Promise<{ lat: number; lng: number }> => {
            return new Promise((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    reject(new Error('timeout'));
                }, 10000);

                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        clearTimeout(timeoutId);
                        resolve({
                            lat: position.coords.latitude,
                            lng: position.coords.longitude,
                        });
                    },
                    (error) => {
                        clearTimeout(timeoutId);
                        reject(error);
                    },
                    {
                        enableHighAccuracy: true,
                        timeout: 10000,
                        maximumAge: 60000
                    }
                );
            });
        };

        try {
            const location = await getDeviceLocation();
            setUserLocation(location); // Set Blue Dot
            setCenter(location);
            mapInstance?.setCenter(location);
            mapInstance?.setZoom(14);
            toast.success("Location detected!");
            fetchPlaces(location);
        } catch (error) {
            if ((error as GeolocationPositionError).code === 1 || (error as GeolocationPositionError).code === 2) {
                console.warn("Geolocation unavailable or denied");
            } else {
                console.error("Geolocation error:", error);
            }
            // On GPS failure, mark as attempted and show LocationModal
            setGpsAttempted(true);
            setLocationModalOpen(true);
        }
    }, [mapInstance, fetchPlaces]);

    /**
     * Handle location selection from LocationModal
     * NOTE: This ONLY updates location state. User must explicitly click a category or search to fetch places.
     */
    const handleLocationSelect = useCallback((location: { lat: number; lng: number; name: string; placeId?: string }) => {
        setCenter(location);
        if (location.placeId) setCityId(location.placeId);

        // Don't set userLocation (Blue Dot) for manually selected cities
        mapInstance?.setCenter(location);
        mapInstance?.setZoom(13);

        // Clear previous results when changing location
        setPlaces([]);
        setScores({});
        setSelectedCategory(null);

        // Guide user to select a category - DON'T auto-fetch places
        toast.success(`📍 Location set to ${location.name}. Now select a category to search!`);
    }, [mapInstance]);

    /**
     * Auto-initialize: detect location on page load (WITHOUT auto-fetching places).
     * Runs once when map AND user auth are ready.
     */
    useEffect(() => {
        if (mapInstance && user && !hasAutoInitialized.current) {
            hasAutoInitialized.current = true;
            console.log('[SearchPage] Auto-initializing location detection (without auto-fetch)...');
            // Only detect location, don't fetch places automatically
            handleDetectLocationOnly();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapInstance, user]);

    /**
     * Detect location only - sets center and userLocation without fetching places
     */
    const handleDetectLocationOnly = useCallback(async () => {
        if (!navigator.geolocation) {
            setLocationModalOpen(true);
            return;
        }

        try {
            const location = await new Promise<{ lat: number; lng: number }>((resolve, reject) => {
                const timeoutId = setTimeout(() => reject(new Error('timeout')), 10000);
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        clearTimeout(timeoutId);
                        resolve({ lat: position.coords.latitude, lng: position.coords.longitude });
                    },
                    (error) => {
                        clearTimeout(timeoutId);
                        reject(error);
                    },
                    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
                );
            });

            setUserLocation(location);
            setCenter(location);
            mapInstance?.setCenter(location);
            mapInstance?.setZoom(14);
            toast.success("Location detected! Select a category to search.");
        } catch (error) {
            if ((error as GeolocationPositionError).code === 1 || (error as GeolocationPositionError).code === 2) {
                console.warn("Geolocation unavailable or denied (auto-detect)");
            } else {
                console.error("Geolocation error:", error);
            }
            setGpsAttempted(true);
            setLocationModalOpen(true);
        }
    }, [mapInstance]);

    /**
     * Handle category button click - fetch places with keyword
     */
    const handleCategorySearch = useCallback((category: string) => {
        setSelectedCategory(category);
        setSearchQuery(category);
        fetchPlaces(undefined, category);
    }, [fetchPlaces]);

    return (
        <ProtectedRoute>
            <RoleGuard allowedRole="diner">
                <div className="flex flex-col h-screen max-h-screen">
                    {/* Header */}
                    <header className="h-16 border-b flex items-center px-4 gap-4 bg-background z-10 shrink-0">
                        <div className="font-bold text-xl tracking-tight hidden md:block text-primary">NearSpotty</div>
                        <form onSubmit={handleSearch} className="flex-1 max-w-xl flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Restaurants, cafes, vegan..."
                                    className="pl-9 bg-gray-50 dark:bg-gray-800 border-none"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                            <Button type="submit" size="icon" variant="ghost" disabled={loading}>
                                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                            </Button>
                        </form>
                        <Button variant="outline" size="sm" className="hidden sm:flex" onClick={handleUseLocation}>
                            <MapPin className="mr-2 h-4 w-4" /> Use my location
                        </Button>
                    </header>

                    {/* Main Content: Split Map/List */}
                    <div className="flex-1 flex overflow-hidden relative">
                        {/* List View */}
                        <div data-results-container className="w-full md:w-[400px] lg:w-[450px] border-r bg-background overflow-y-auto flex flex-col p-4 gap-4 shrink-0 z-10 shadow-xl md:shadow-none absolute md:relative bottom-0 h-1/2 md:h-full rounded-t-2xl md:rounded-none bg-white/90 backdrop-blur-sm md:bg-background">
                            <div className="flex justify-between items-center pb-2 sticky top-0 bg-inherit z-20">
                                <h2 className="font-semibold text-lg">Results</h2>
                                <div className="flex items-center gap-2">
                                    {subscriptionTier === 'free' && (
                                        <span className={`text-xs px-2 py-1 rounded-full ${remainingScans > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {remainingScans > 0 ? `${remainingScans} searches left` : 'Limit reached'}
                                        </span>
                                    )}
                                    {subscriptionTier === 'premium' && (
                                        <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700">Premium ✨</span>
                                    )}
                                    <span className="text-xs text-muted-foreground">{places.length} found</span>
                                </div>
                            </div>

                            {/* Upgrade CTA when limit reached */}
                            {limitReached && subscriptionTier === 'free' && (
                                <div className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl p-4 text-white">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Sparkles className="h-5 w-5" />
                                        <h3 className="font-semibold">Unlock Unlimited Searches</h3>
                                    </div>
                                    <p className="text-sm text-white/90 mb-3">
                                        You&apos;ve used all your free searches this month. Upgrade to Premium for unlimited AI-powered restaurant discoveries!
                                    </p>
                                    <Link href="/pricing">
                                        <Button className="w-full bg-white text-purple-600 hover:bg-white/90">
                                            Upgrade to Premium
                                        </Button>
                                    </Link>
                                </div>
                            )}

                            {places.length === 0 && !loading && (
                                <div className="flex-1 flex flex-col items-center justify-start pt-8 px-4 space-y-6 animate-in fade-in zoom-in duration-500">
                                    {/* Current Location Display */}
                                    <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 rounded-full border border-primary/20">
                                        <MapPin className="h-4 w-4 text-primary" />
                                        <span className="text-sm font-medium text-primary">
                                            {cityId ? "Location set" : "Bratislava (default)"}
                                        </span>
                                    </div>

                                    <div className="text-center space-y-2">
                                        <h3 className="text-xl font-bold tracking-tight text-gray-900">
                                            What are you craving today?
                                        </h3>
                                        <p className="text-muted-foreground text-sm max-w-xs mx-auto">
                                            Select a category to find the best spots nearby, curated by AI.
                                        </p>
                                    </div>

                                    {/* Location Action Buttons */}
                                    <div className="flex flex-wrap gap-2 justify-center">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setLocationModalOpen(true)}
                                            className="text-xs"
                                        >
                                            <MapPin className="mr-1.5 h-3.5 w-3.5" />
                                            Change Location
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleUseLocation}
                                            className="text-xs"
                                        >
                                            <MapPin className="mr-1.5 h-3.5 w-3.5 text-blue-500" />
                                            Use My Location
                                        </Button>
                                    </div>

                                    <CategoryGrid
                                        onSelectCategory={(categoryId) => {
                                            const category = APP_CATEGORIES.find(c => c.id === categoryId);
                                            if (category) {
                                                handleCategorySearch(category.id); // Use ID as keyword/type
                                            }
                                        }}
                                        activeCategory={selectedCategory}
                                        usageCount={5 - remainingScans} // Approximate usage since remainingScans = 5 - usage
                                        isPremium={subscriptionTier === 'premium'}
                                        disabled={limitReached}
                                    />

                                    {limitReached && (
                                        <div className="w-full max-w-sm">
                                            <Link href="/pricing">
                                                <Button className="w-full py-6 text-lg bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 shadow-xl transition-all hover:scale-[1.02]">
                                                    <Sparkles className="mr-2 h-5 w-5" />
                                                    Unlock Unlimited Access
                                                </Button>
                                            </Link>
                                        </div>
                                    )}
                                </div>
                            )}

                            {loading && (
                                <div className="space-y-4">
                                    {[1, 2, 3, 4].map((i) => (
                                        <PlaceCardSkeleton key={i} />
                                    ))}
                                </div>
                            )}

                            <div className="space-y-4 pb-20 md:pb-0">
                                {places.map((place) => (
                                    <div key={place.place_id} id={`place-${place.place_id}`} className={`transition-all duration-300 rounded-lg ${selectedPlaceId === place.place_id ? 'ring-2 ring-primary shadow-lg scale-[1.02]' : ''}`}>
                                        <PlaceCard
                                            place={place}
                                            preferences={preferences}
                                            score={scores[place.place_id]}
                                            scoringLoading={scoringLoading}
                                            limitReached={limitReached}
                                            onBeforeNavigate={() => {
                                                // Save scroll position to cache before navigating
                                                const container = document.querySelector('[data-results-container]');
                                                if (container) {
                                                    saveScrollPosition(container.scrollTop);
                                                }
                                            }}
                                            onClick={() => {
                                                setSelectedPlaceId(place.place_id);
                                                mapInstance?.panTo(place.geometry.location);
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Map View */}
                        <div className="flex-1 bg-gray-100 relative h-full">
                            <Map
                                className="absolute inset-0"
                                onLoad={setMapInstance}
                                initialCenter={center}
                                userLocation={userLocation}
                            />
                        </div>
                    </div>

                    {/* Location Modal */}
                    <LocationModal
                        isOpen={locationModalOpen}
                        onClose={() => setLocationModalOpen(false)}
                        onSelectLocation={handleLocationSelect}
                        onRetryGPS={handleUseLocation}
                        hideGPSRetry={gpsAttempted}
                    />
                </div>
            </RoleGuard>
        </ProtectedRoute>
    );
}
