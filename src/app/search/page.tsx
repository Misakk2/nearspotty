"use client";
import Map from "@/components/search/map";
import ProtectedRoute from "@/components/protected-route";
import RoleGuard from "@/components/RoleGuard";
import PlaceCard from "@/components/search/place-card";
import { PlaceCardSkeleton } from "@/components/search/PlaceCardSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Place } from "@/types/place";
import { Search, MapPin, Loader2 } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import { useAuth } from "@/components/auth-provider";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { UserPreferences, GeminiScore } from "@/types";
import { getLocationFromIP } from "@/lib/ip-geolocation";

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

    // Default to Bratislava
    const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);

    // Default to Bratislava
    const [center, setCenter] = useState({ lat: 48.1486, lng: 17.1077 });

    // Track if auto-initialization has run (prevents double-init)
    const hasAutoInitialized = useRef(false);

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
                    // Fetch preferences
                    const prefRef = doc(db, "users", user.uid, "preferences", "main");
                    const prefSnap = await getDoc(prefRef);
                    if (prefSnap.exists()) {
                        setPreferences(prefSnap.data() as UserPreferences);
                    }

                    // Fetch subscription tier and usage
                    const userRef = doc(db, "users", user.uid);
                    const userSnap = await getDoc(userRef);
                    if (userSnap.exists()) {
                        const data = userSnap.data();
                        const tier = data.subscriptionTier || (data.plan === 'premium' ? 'premium' : 'free');
                        setSubscriptionTier(tier);

                        // Get AI usage
                        const usage = data.aiUsage || { count: 0 };
                        const remaining = tier === 'premium' ? Infinity : Math.max(0, 5 - usage.count);
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

    const fetchPlaces = useCallback(async (location?: { lat: number; lng: number }, query?: string) => {
        setLoading(true);
        setSelectedPlaceId(null);
        try {
            const params = new URLSearchParams();
            if (query) params.append("keyword", query);
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

            const res = await fetch(`/api/places/nearby?${params.toString()}`);
            const data = await res.json();

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
            } else {
                toast.error("No results found");
            }
        } catch (error) {
            console.error(error);
            toast.error("Failed to fetch places");
        } finally {
            setLoading(false);
        }
    }, [center, mapInstance]);

    /**
     * Auto-score places with AI when user has remaining scans.
     * Called automatically after places load.
     */
    const autoScorePlaces = useCallback(async (placesToScore: Place[]) => {
        if (!user || !preferences || placesToScore.length === 0) return;
        if (limitReached) return; // Already at limit, don't attempt

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
                const newScores: ScoreMap = {};
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

    // Default fallback location (Košice city center)
    const FALLBACK_LOCATION = { lat: 48.7164, lng: 21.2611 };

    /**
     * Try to get location from IP when browser geolocation fails.
     * Falls back to Košice only if IP geolocation also fails.
     */
    const tryIPFallback = useCallback(async (): Promise<{ lat: number; lng: number }> => {
        const ipLocation = await getLocationFromIP();
        if (ipLocation) {
            toast(`Using IP-based location (${ipLocation.city || 'detected'})`, { icon: "🌐" });
            return { lat: ipLocation.lat, lng: ipLocation.lng };
        }
        toast("Using approximate location (Košice)", { icon: "📍" });
        return FALLBACK_LOCATION;
    }, []);

    /**
     * Handle location request with timeout and IP fallback.
     * Falls back to IP geolocation if browser geolocation fails with Error 2.
     */
    const handleUseLocation = useCallback(async () => {
        if (!navigator.geolocation) {
            // No geolocation support - try IP first
            const location = await tryIPFallback();
            setCenter(location);
            mapInstance?.setCenter(location);
            mapInstance?.setZoom(14);
            fetchPlaces(location);
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
                        enableHighAccuracy: false,
                        timeout: 10000,
                        maximumAge: 300000
                    }
                );
            });
        };

        try {
            const location = await getDeviceLocation();
            setCenter(location);
            mapInstance?.setCenter(location);
            mapInstance?.setZoom(14);
            fetchPlaces(location);
        } catch (error) {
            console.error("Geolocation error:", error);

            // For Error 2 (POSITION_UNAVAILABLE) or timeout, try IP fallback
            const location = await tryIPFallback();
            setCenter(location);
            mapInstance?.setCenter(location);
            mapInstance?.setZoom(14);
            fetchPlaces(location);
        }
    }, [mapInstance, fetchPlaces, tryIPFallback]);

    /**
     * Auto-initialize: detect location and search on page load.
     * Runs once when map is ready.
     */
    useEffect(() => {
        if (mapInstance && !hasAutoInitialized.current) {
            hasAutoInitialized.current = true;
            console.log('[SearchPage] Auto-initializing location detection...');
            handleUseLocation();
        }
    }, [mapInstance, handleUseLocation]);

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
                        <div className="w-full md:w-[400px] lg:w-[450px] border-r bg-background overflow-y-auto flex flex-col p-4 gap-4 shrink-0 z-10 shadow-xl md:shadow-none absolute md:relative bottom-0 h-1/2 md:h-full rounded-t-2xl md:rounded-none bg-white/90 backdrop-blur-sm md:bg-background">
                            <div className="flex justify-between items-center pb-2 sticky top-0 bg-inherit z-20">
                                <h2 className="font-semibold text-lg">Results</h2>
                                <div className="flex items-center gap-2">
                                    {subscriptionTier === 'free' && (
                                        <span className={`text-xs px-2 py-1 rounded-full ${remainingScans > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {remainingScans > 0 ? `${remainingScans} AI scans left` : 'Limit reached'}
                                        </span>
                                    )}
                                    {subscriptionTier === 'premium' && (
                                        <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700">Premium</span>
                                    )}
                                    <span className="text-xs text-muted-foreground">{places.length} found</span>
                                </div>
                            </div>

                            {places.length === 0 && !loading && (
                                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-muted-foreground space-y-2">
                                    <Search className="h-12 w-12 opacity-20" />
                                    <p>Search for a place or use your location to find safe eats!</p>
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
                            <Map className="absolute inset-0" onLoad={setMapInstance} />
                        </div>
                    </div>
                </div>
            </RoleGuard>
        </ProtectedRoute>
    );
}
