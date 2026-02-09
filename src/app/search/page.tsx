"use client";
import { useRouter, useSearchParams } from "next/navigation";
import Map from "@/components/search/map";
import ProtectedRoute from "@/components/protected-route";
import RoleGuard from "@/components/RoleGuard";
import PlaceCard from "@/components/search/place-card";
import LocationModal from "@/components/search/LocationModal";
import { Button } from "@/components/ui/button";
import { Place } from "@/types/place";
import { MapPin, Sparkles, Lock } from "lucide-react";
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
import MobileSearch from "@/components/search/MobileSearch";
import { useSearchState } from "@/hooks/useSearchState";
import { PremiumBadge } from "@/components/ui/PremiumBadge";
import { CommunicativeLoader } from "@/components/ui/CommunicativeLoader";
import { SmartDiscoveryAlert } from "@/components/search/SmartDiscoveryAlert";
import { PioneerOverlay } from "@/components/PioneerOverlay";
import { DecisionView, DecisionChoices } from "@/components/search/DecisionView";

// Score map type for storing scores by place_id
type ScoreMap = Record<string, GeminiScore>;

export default function SearchPage() {
    const { user } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();

    // -- Persistent State from Store --
    const {
        state: {
            places,
            scores,
            center,
            cityId,
            selectedCategory,
            // scrollPosition,
            searchQuery,
            isLoading: loading
        },
        setPlaces: setStorePlaces,
        updateScores: updateStoreScores,
        setCategory: setStoreCategory,
        setLocation: setStoreLocation,
        setCity: setStoreCity,
        setSearchQuery: setStoreSearchQuery,
        setLoading: setStoreLoading,
        saveScrollPosition,
        resetSearch: resetStoreSearch,
        startSearch: storeStartSearch
    } = useSearchState();

    // -- Local UI/Fetch State --
    // Query and Loading are now in store
    const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const markers = useRef<any[]>([]);
    const [preferences, setPreferences] = useState<UserPreferences | null>(null);

    // AI Scoring local state
    const [scoringLoading, setScoringLoading] = useState(false);
    const [limitReached, setLimitReached] = useState(false);
    const [subscriptionTier, setSubscriptionTier] = useState<'free' | 'premium'>('free');
    const [remainingScans, setRemainingScans] = useState(5);

    // Smart Discovery State
    const [discoveryMessage, setDiscoveryMessage] = useState<string | null>(null);
    const [relevanceStatus, setRelevanceStatus] = useState<string>("match");
    const [currentRadius, setCurrentRadius] = useState(5000);

    // Pioneer Bonus Overlay
    const [showPioneerOverlay, setShowPioneerOverlay] = useState(false);

    // Decision Point State (Lazy Decision Point)
    const [decisionData, setDecisionData] = useState<{
        message: string;
        choices: DecisionChoices;
    } | null>(null);

    // Location local UI state
    const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | undefined>(undefined);
    const [locationModalOpen, setLocationModalOpen] = useState(false);
    const [gpsAttempted, setGpsAttempted] = useState(false);
    // const [locationMode, setLocationMode] = useState<'near_me' | 'custom'>('near_me');
    // const [selectedCityName, setSelectedCityName] = useState<string | null>(null);

    // Track if auto-initialization has run
    const hasAutoInitialized = useRef(false);

    // Sync subscription on mount
    useSubscriptionSync();

    // Helper wrappers to match previous API where possible
    const setPlaces = useCallback((newPlaces: Place[]) => setStorePlaces(newPlaces), [setStorePlaces]);
    const setScores = useCallback((newScores: ScoreMap) => updateStoreScores(newScores), [updateStoreScores]);
    const setCenter = useCallback((loc: { lat: number; lng: number }) => setStoreLocation({ ...loc, cityId: cityId || undefined }), [setStoreLocation, cityId]);
    // const setCityId = (id: string | null) => {
    //     if (id) setStoreLocation({ lat: center.lat, lng: center.lng, cityId: id });
    // };
    const setSelectedCategory = useCallback((cat: string | null) => setStoreCategory(cat), [setStoreCategory]);
    const setSearchQuery = useCallback((q: string) => setStoreSearchQuery(q), [setStoreSearchQuery]);
    const setLoading = useCallback((l: boolean) => setStoreLoading(l), [setStoreLoading]);


    // 1. URL State Management (Source of Truth)
    useEffect(() => {
        const q = searchParams.get("q") || searchParams.get("keyword");
        const lat = searchParams.get("lat");
        const lng = searchParams.get("lng");
        const category = searchParams.get("category");
        const action = searchParams.get("action");

        // Restore state from URL logic
        if (lat && lng) {
            const newCenter = { lat: parseFloat(lat), lng: parseFloat(lng) };
            // Update store logic if needed, but for now local map update
            setStoreLocation({ lat: newCenter.lat, lng: newCenter.lng }); // Sync URL to Store

            if (mapInstance) {
                mapInstance.setCenter(newCenter);
            }
        }

        if (q) setSearchQuery(q);
        if (category) setSelectedCategory(category);

        if (action === "use_location" && !userLocation) {
            handleUseLocation();
            const newParams = new URLSearchParams(searchParams.toString());
            newParams.delete("action");
            router.replace(`/search?${newParams.toString()}`);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams, mapInstance]);

    // 2. Fetch Places logic
    // 2. Fetch Places logic (Reacting to URL changes)
    // 2. Fetch Places logic (Reacting to URL changes)
    // MODIFIED: Only fetch if there is an explicit query or category. 
    // Do NOT fetch solely on location change (manual trigger preferred).
    useEffect(() => {
        const q = searchParams.get("q") || searchParams.get("keyword");
        const category = searchParams.get("category");
        // const lat = searchParams.get("lat"); // Ignored for auto-fetch
        // const lng = searchParams.get("lng"); // Ignored for auto-fetch

        // Only auto-trigger if we have an intent (query/category)
        if (q || category) {
            const lat = searchParams.get("lat");
            const lng = searchParams.get("lng");
            const location = (lat && lng)
                ? { lat: parseFloat(lat), lng: parseFloat(lng) }
                : undefined;

            fetchPlaces(
                location,
                q || category || undefined
            );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    // Sync scroll
    useEffect(() => {
        if (selectedPlaceId) {
            const el = document.getElementById(`place-${selectedPlaceId}`);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }, [selectedPlaceId]);

    // Fetch user preferences/subscription
    useEffect(() => {
        const fetchUserData = async () => {
            if (user) {
                try {
                    const prefRef = doc(db, "users", user.uid, "preferences", "main");
                    const prefSnap = await getDoc(prefRef);
                    if (prefSnap.exists()) {
                        setPreferences(prefSnap.data() as UserPreferences);
                    }

                    const userRef = doc(db, "users", user.uid);
                    const userSnap = await getDoc(userRef);
                    if (userSnap.exists()) {
                        const data = userSnap.data();
                        const tier: 'free' | 'premium' = data.tier || 'free';
                        setSubscriptionTier(tier);

                        const credits = data.credits || { remaining: 5, used: 0, limit: 5 };
                        const remaining = tier === 'premium' ? -1 : credits.remaining;
                        setRemainingScans(remaining);
                        setLimitReached(remaining === 0 && tier === 'free');
                    }
                } catch (error) {
                    console.error("Error fetching user data:", error);
                }
            }
        };
        fetchUserData();
    }, [user]);

    const fetchPlaces = useCallback(async (location?: { lat: number; lng: number }, query?: string, cityIdOverride?: string, radius: number = 5000) => {
        if (!user) {
            toast.error("Please log in to search");
            return;
        }

        storeStartSearch(); // Clear old results and set loading=true atomically
        setSelectedPlaceId(null);
        setDiscoveryMessage(null); // Reset discovery
        setRelevanceStatus("match");
        setCurrentRadius(radius); // Sync local state
        setDecisionData(null); // Clear any previous decision point

        try {
            const token = await user.getIdToken();
            const params = new URLSearchParams();
            if (query) params.append("keyword", query);

            const activeCityId = cityIdOverride || cityId;
            if (activeCityId) params.append("cityId", activeCityId);

            params.append("radius", radius.toString());

            if (location) {
                params.append("lat", location.lat.toString());
                params.append("lng", location.lng.toString());
            } else {
                if (center.lat !== 0 || center.lng !== 0) {
                    params.append("lat", center.lat.toString());
                    params.append("lng", center.lng.toString());
                }
            }

            const res = await fetch(`/api/search?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();

            if (res.status === 402 || data.code === 'LIMIT_REACHED' || (data.usage && data.usage.limitReached)) {
                setLimitReached(true);
                setRemainingScans(0);
                setPlaces([]); // Clear results to force focus on upgrade
                // toast.error("Daily limit reached"); 
                // Don't toast, the UI banner is better
            } else {
                setLimitReached(false);
            }

            if (res.status === 401) {
                toast.error("Session expired.");
                return;
            }

            // Sync credits from API response (primary source of truth)
            if (data.credits) {
                setRemainingScans(data.credits.remaining);
                setSubscriptionTier(data.credits.tier as 'free' | 'premium');
                if (data.credits.remaining === 0 && data.credits.tier === 'free') {
                    setLimitReached(true);
                }
            } else if (data.usage) {
                // Fallback to legacy usage format
                setRemainingScans(data.usage.remaining);
                setSubscriptionTier(data.usage.tier);
                if ((data.usage.remaining === 0 && data.usage.tier === 'free') || data.usage.limitReached) {
                    setLimitReached(true);
                }
            }

            // Pioneer Bonus celebration
            if (data.pioneerBonus) {
                setShowPioneerOverlay(true);
            }

            // Handle DECISION_REQUIRED status (Lazy Decision Point)
            if (data.status === 'DECISION_REQUIRED' && data.choices) {
                console.log('[SearchPage] Decision point triggered:', data.choices);
                setDecisionData({
                    message: data.message || 'No exact match found in your area.',
                    choices: data.choices
                });
                setLoading(false);
                return; // Don't process normal results
            }

            if (data.results) {
                // Extract AI scores from the backend result if present
                const newScores: ScoreMap = {};
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                data.results.forEach((p: any) => {
                    if (p.ai_score) {
                        newScores[p.place_id] = p.ai_score;
                    }
                });

                // Update stores
                if (Object.keys(newScores).length > 0) {
                    setScores(newScores);
                }

                if (Object.keys(newScores).length > 0) {
                    setScores(newScores);
                }

                // Set Smart Discovery State
                setRelevanceStatus(data.relevanceStatus || "match");
                setDiscoveryMessage(data.discoveryMessage || null);

                setPlaces(data.results);
                if (mapInstance && data.results.length > 0) {
                    const bounds = new google.maps.LatLngBounds();
                    let hasValidBounds = false;
                    data.results.forEach((p: Place) => {
                        if (p.geometry?.location) {
                            bounds.extend(p.geometry.location);
                            hasValidBounds = true;
                        }
                    });
                    if (hasValidBounds) mapInstance.fitBounds(bounds);
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
    }, [center, cityId, mapInstance, user, setPlaces, setLoading, setScores, storeStartSearch]);

    // Auto-score logic
    const autoScorePlaces = useCallback(async (placesToScore: Place[]) => {
        if (!user || !preferences || placesToScore.length === 0 || limitReached) return;

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
                toast("AI scan limit reached.", { icon: "🔒" });
                return;
            }

            if (data.results) {
                const newScores: ScoreMap = {};
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                data.results.forEach((r: { place_id: string; score: GeminiScore }) => {
                    newScores[r.place_id] = r.score;
                });
                updateStoreScores(newScores); // Merged in store

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
    }, [user, preferences, limitReached, updateStoreScores]);

    useEffect(() => {
        if (places.length > 0 && !limitReached && preferences) {
            // Check if we already have scores for these places to avoid re-scoring on reload?
            // Store persists scores.
            const needsScoring = places.some(p => !scores[p.place_id]);
            if (needsScoring) {
                autoScorePlaces(places.filter(p => !scores[p.place_id]));
            }
        }
    }, [places, limitReached, preferences, autoScorePlaces, scores]);

    // Map Markers
    useEffect(() => {
        if (!mapInstance) return;

        markers.current.forEach(m => {
            if (m && typeof m.map !== 'undefined') m.map = null;
        });
        markers.current = [];

        (async () => {
            try {
                const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker") as google.maps.MarkerLibrary;
                const newMarkers = places.map(place => {
                    const isClaimed = place.isClaimed;
                    const pin = new PinElement({
                        background: isClaimed ? 'hsl(158, 64%, 39%)' : '#4285F4',
                        borderColor: isClaimed ? 'hsl(158, 64%, 25%)' : '#2563EB',
                        glyphColor: '#FFFFFF',
                        scale: isClaimed ? 1.1 : 1.0,
                    });
                    if (!place.geometry?.location) return null;
                    const marker = new AdvancedMarkerElement({
                        position: place.geometry.location,
                        map: mapInstance,
                        title: place.name,
                        content: pin.element,
                        zIndex: isClaimed ? 10 : 1, // Claimed on top
                    });
                    marker.addListener("click", () => setSelectedPlaceId(place.place_id));
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
        const params = new URLSearchParams(searchParams.toString());
        if (searchQuery) params.set("q", searchQuery);
        else params.delete("q");
        router.push(`/search?${params.toString()}`);
    };

    const handleUseLocation = useCallback(async () => {
        if (!navigator.geolocation) {
            setLocationModalOpen(true);
            return;
        }

        try {
            const location = await new Promise<{ lat: number; lng: number }>((resolve, reject) => {
                const timeoutId = setTimeout(() => reject(new Error('timeout')), 15000);
                navigator.geolocation.getCurrentPosition(
                    (p) => { clearTimeout(timeoutId); resolve({ lat: p.coords.latitude, lng: p.coords.longitude }); },
                    (e) => { clearTimeout(timeoutId); reject(e); },
                    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
                );
            });

            const params = new URLSearchParams(searchParams.toString());
            params.set("lat", location.lat.toString());
            params.set("lng", location.lng.toString());
            router.push(`/search?${params.toString()}`);
            toast.success("Location detected!");

            setUserLocation(location);
            setCenter(location); // This updates store via wrapper
            mapInstance?.setCenter(location);
            mapInstance?.setZoom(14);
        } catch {
            toast.error("Could not detect location. Please type a city name.");
            setGpsAttempted(true);
            setLocationModalOpen(true);
        }
    }, [mapInstance, searchParams, router, setCenter]);

    const handleLocationSelect = useCallback((location: { lat: number; lng: number; name: string; placeId?: string }) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("lat", location.lat.toString());
        params.set("lng", location.lng.toString());
        router.push(`/search?${params.toString()}`);

        // Update Store
        if (location.placeId) {
            setStoreCity({ id: location.placeId, name: location.name, lat: location.lat, lng: location.lng });
        } else {
            setCenter(location);
        }

        // Update location mode for UI
        // setLocationMode('custom');
        // setSelectedCityName(location.name);

        mapInstance?.setCenter(location);
        mapInstance?.setZoom(13);
        toast.success(`📍 Location set to ${location.name}.`);
    }, [mapInstance, searchParams, router, setCenter, setStoreCity]);

    useEffect(() => {
        if (mapInstance && user && !hasAutoInitialized.current) {
            hasAutoInitialized.current = true;
            const hasLocationParams = searchParams.has("lat") && searchParams.has("lng");
            if (!hasLocationParams) {
                handleDetectLocationOnly();
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapInstance, user, searchParams]);

    const handleDetectLocationOnly = useCallback(async () => {
        if (!navigator.geolocation) {
            setLocationModalOpen(true);
            return;
        }
        try {
            const location = await new Promise<{ lat: number; lng: number }>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(
                    (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
                    (e) => reject(e),
                    { enableHighAccuracy: true, timeout: 10000 }
                );
            });
            const params = new URLSearchParams(searchParams.toString());
            params.set("lat", location.lat.toString());
            params.set("lng", location.lng.toString());
            router.replace(`/search?${params.toString()}`);
            setUserLocation(location);
            setCenter(location);
            mapInstance?.setCenter(location);
        } catch {
            setGpsAttempted(true);
        }
    }, [searchParams, router, mapInstance, setCenter]);

    const handleCategorySearch = useCallback((category: string) => {
        setStoreCategory(category); // Use store setter
        setSearchQuery(category);
        fetchPlaces(undefined, category);
    }, [fetchPlaces, setStoreCategory, setSearchQuery]);

    const handleClearSearch = () => {
        resetStoreSearch();
        router.push("/search"); // Clear URL params
        toast.success("Search cleared");
    };

    const handleIncreaseRadius = () => {
        // Expand to 10km (or add 5km to current)
        const newRadius = currentRadius + 5000;
        toast.loading(`Expanding search to ${newRadius / 1000}km...`);
        fetchPlaces(undefined, searchQuery || undefined, undefined, newRadius);
    };

    // const handleRadiusChange = (newRadius: number) => {
    //     setCurrentRadius(newRadius);
    //     // Debounced search will be triggered when user stops sliding
    //     // For now, just update state - user can trigger search via category/query
    // };


    return (
        <ProtectedRoute>
            <RoleGuard allowedRole="diner">
                <div className="flex flex-col h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)] relative">
                    <div className="flex-1 flex overflow-hidden relative">
                        {/* List View */}
                        <div data-results-container className="hidden md:flex w-[400px] lg:w-[450px] border-r bg-background overflow-y-auto flex-col p-4 gap-4 shrink-0 z-10 shadow-none h-full bg-background">
                            <div className="flex justify-between items-center pb-2 sticky top-0 bg-inherit z-20">
                                <h2 className="font-semibold text-lg">Results</h2>
                                <div className="flex items-center gap-2">
                                    {subscriptionTier === 'free' && (
                                        <span className={`text-xs px-2 py-1 rounded-full ${remainingScans > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {remainingScans > 0 ? `${remainingScans} searches left` : 'Limit reached'}
                                        </span>
                                    )}
                                    {subscriptionTier === 'premium' && (
                                        <PremiumBadge size="sm" />
                                    )}
                                    <span className="text-xs text-muted-foreground">{places.length} found</span>
                                    {(places.length > 0 || searchQuery) && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={handleClearSearch}
                                            className="h-6 w-6 p-0 hover:bg-gray-100 rounded-full"
                                            title="Clear Search"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                                        </Button>
                                    )}
                                </div>
                            </div>



                            {/* Upgrade CTA */}
                            {limitReached && subscriptionTier === 'free' && (
                                <div className="bg-gradient-to-r from-gray-800 to-gray-900 rounded-xl p-4 text-white shadow-md mx-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Lock className="h-4 w-4 text-amber-400" />
                                        <h3 className="font-semibold text-sm text-amber-50">Basic Search Mode</h3>
                                    </div>
                                    <p className="text-xs text-gray-300 mb-3 leading-relaxed">
                                        You have used your monthly AI credits. Showing standard results without AI scoring or deep insights.
                                    </p>
                                    <Link href="/subscription">
                                        <Button size="sm" className="w-full bg-amber-500 hover:bg-amber-600 text-white border-none font-semibold">
                                            <Sparkles className="h-3 w-3 mr-1.5" />
                                            Unlock Premium
                                        </Button>
                                    </Link>
                                </div>
                            )}

                            {places.length === 0 && !loading && !decisionData && (
                                <div className="flex-1 flex flex-col items-center justify-start pt-8 px-4 space-y-6 animate-in fade-in zoom-in duration-500">
                                    <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 rounded-full border border-primary/20">
                                        <MapPin className="h-4 w-4 text-primary" />
                                        <span className="text-sm font-medium text-primary">
                                            {cityId ? "Location set" : "Bratislava (default)"}
                                        </span>
                                    </div>
                                    <div className="text-center space-y-2">
                                        <h3 className="text-xl font-bold tracking-tight text-gray-900">What are you craving?</h3>
                                        <p className="text-muted-foreground text-sm max-w-xs mx-auto">Select a category.</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2 justify-center">
                                        <Button variant="outline" size="sm" onClick={() => setLocationModalOpen(true)} className="text-xs">
                                            <MapPin className="mr-1.5 h-3.5 w-3.5" /> Change Location
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={handleUseLocation} className="text-xs">
                                            <MapPin className="mr-1.5 h-3.5 w-3.5 text-blue-500" /> Use My Location
                                        </Button>
                                    </div>
                                    <CategoryGrid
                                        onSelectCategory={(categoryId) => {
                                            const category = APP_CATEGORIES.find(c => c.id === categoryId);
                                            if (category) handleCategorySearch(category.id);
                                        }}
                                        activeCategory={selectedCategory}
                                        usageCount={5 - remainingScans}
                                        isPremium={subscriptionTier === 'premium'}
                                        disabled={limitReached}
                                    />
                                </div>
                            )}

                            {loading && <CommunicativeLoader />}

                            {/* Decision Point UI (Lazy Decision Point) */}
                            {!loading && decisionData && (
                                <DecisionView
                                    message={decisionData.message}
                                    choices={decisionData.choices}
                                    isLoading={loading}
                                    onSelectSurvival={(id) => {
                                        // Navigate to place detail page
                                        router.push(`/place/${id}`);
                                    }}
                                    onExpandRadius={(newRadius) => {
                                        // Trigger new search with expanded radius
                                        setDecisionData(null);
                                        fetchPlaces(undefined, searchQuery || undefined, undefined, newRadius);
                                    }}
                                />
                            )}

                            {!loading && !decisionData && relevanceStatus === "no_exact_match" && (
                                <SmartDiscoveryAlert
                                    keyword={searchQuery}
                                    message={discoveryMessage}
                                    onIncreaseRadius={handleIncreaseRadius}
                                />
                            )}

                            <div className="space-y-4 md:pb-0">
                                {places.map((place) => (
                                    <div key={place.place_id} id={`place-${place.place_id}`} className={`transition-all duration-300 rounded-lg ${selectedPlaceId === place.place_id ? 'ring-2 ring-primary shadow-lg scale-[1.02]' : ''}`}>
                                        <PlaceCard
                                            place={place}
                                            preferences={preferences}
                                            score={scores[place.place_id]}
                                            scoringLoading={scoringLoading}
                                            limitReached={limitReached}
                                            onBeforeNavigate={() => {
                                                const container = document.querySelector('[data-results-container]');
                                                if (container) saveScrollPosition(container.scrollTop);
                                            }}
                                            onClick={() => {
                                                setSelectedPlaceId(place.place_id);
                                                mapInstance?.panTo(place.geometry.location);
                                            }}
                                            userLocation={userLocation ?? undefined}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Map View */}
                        <div className="flex-1 bg-gray-100 relative h-full">
                            <Map
                                className="absolute inset-0 z-0"
                                onLoad={setMapInstance}
                                initialCenter={center}
                                userLocation={userLocation}
                            />
                        </div>

                        <MobileSearch
                            places={places}
                            loading={loading}
                            scoringLoading={scoringLoading}
                            searchQuery={searchQuery}
                            setSearchQuery={setSearchQuery}
                            onClear={handleClearSearch}
                            onSearch={handleSearch}
                            onCategorySelect={handleCategorySearch}
                            selectedCategory={selectedCategory}
                            scores={scores}
                            preferences={preferences}
                            limitReached={limitReached}
                            remainingScans={remainingScans}
                            subscriptionTier={subscriptionTier}
                            onUseLocation={handleUseLocation}
                            userLocation={userLocation}
                            onPlaceSelect={(id: string) => {
                                setSelectedPlaceId(id);
                                const place = places.find(p => p.place_id === id);
                                if (place && mapInstance) {
                                    mapInstance.panTo(place.geometry.location);
                                    mapInstance.setZoom(16);
                                }
                            }}

                        />
                    </div>
                    <LocationModal
                        isOpen={locationModalOpen}
                        onClose={() => setLocationModalOpen(false)}
                        onSelectLocation={handleLocationSelect}
                        onRetryGPS={handleUseLocation}
                        hideGPSRetry={gpsAttempted}
                    />
                    <PioneerOverlay
                        show={showPioneerOverlay}
                        onComplete={() => setShowPioneerOverlay(false)}
                    />
                </div>
            </RoleGuard>
        </ProtectedRoute>
    );
}
