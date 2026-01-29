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
import { UserPreferences } from "@/types";

export default function SearchPage() {
    const { user } = useAuth();
    const [searchQuery, setSearchQuery] = useState("");
    const [places, setPlaces] = useState<Place[]>([]);
    const [loading, setLoading] = useState(false);
    const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
    const markers = useRef<google.maps.Marker[]>([]);
    const [preferences, setPreferences] = useState<UserPreferences | null>(null);

    // Default to Bratislava
    const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);

    // Default to Bratislava
    const [center, setCenter] = useState({ lat: 48.1486, lng: 17.1077 });

    // Scroll to selected place
    useEffect(() => {
        if (selectedPlaceId) {
            const el = document.getElementById(`place-${selectedPlaceId}`);
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        }
    }, [selectedPlaceId]);

    // Fetch user preferences
    useEffect(() => {
        const fetchPreferences = async () => {
            if (user) {
                try {
                    const docRef = doc(db, "users", user.uid, "preferences", "main");
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        setPreferences(docSnap.data() as UserPreferences);
                    }
                } catch (error) {
                    console.error("Error fetching preferences:", error);
                }
            }
        };
        fetchPreferences();
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

    // Update map markers when places change
    useEffect(() => {
        if (!mapInstance) return;

        // Clear old markers
        markers.current.forEach(m => m.setMap(null));
        markers.current = [];

        const newMarkers = places.map(place => {
            const marker = new google.maps.Marker({
                position: place.geometry.location,
                map: mapInstance,
                title: place.name,
                // animation: google.maps.Animation.DROP, 
            });

            marker.addListener("click", () => {
                setSelectedPlaceId(place.place_id);
                // Optional: Zoom in slightly or pan
                // mapInstance.panTo(place.geometry.location);
            });
            return marker;
        });

        markers.current = newMarkers;
    }, [places, mapInstance]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchPlaces(undefined, searchQuery);
    };

    const handleUseLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((position) => {
                const pos = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                };
                setCenter(pos);
                mapInstance?.setCenter(pos);
                mapInstance?.setZoom(14);
                fetchPlaces(pos);
            }, () => {
                toast.error("Could not get your location");
            });
        }
    };

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
                                <span className="text-xs text-muted-foreground">{places.length} found</span>
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
