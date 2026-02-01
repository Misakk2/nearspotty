"use client";

import { useEffect, useRef, useState } from "react";
import loader from "@/lib/google-maps";

interface MapProps {
    className?: string;
    onLoad?: (map: google.maps.Map) => void;
    /** Initial center coordinates for the map */
    initialCenter?: { lat: number; lng: number };
    /** User's current GPS location - displays a blue dot marker */
    userLocation?: { lat: number; lng: number };
}

// Default fallback location (Bratislava)
const DEFAULT_CENTER = { lat: 48.1486, lng: 17.1077 };

/**
 * Map component - displays Google Map with optional user location marker
 * 
 * - Geolocation is handled by parent component
 * - Shows Blue Dot at userLocation if provided
 * - initialCenter sets the map's starting position
 */
export default function Map({ className, onLoad, initialCenter, userLocation }: MapProps) {
    const mapRef = useRef<HTMLDivElement>(null);
    const [map, setMap] = useState<google.maps.Map | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userMarkerRef = useRef<any>(null);

    // Initialize map
    useEffect(() => {
        if (!mapRef.current || map) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (loader as any).importLibrary("maps").then(async () => {
            const { Map } = await google.maps.importLibrary("maps") as google.maps.MapsLibrary;

            const center = initialCenter || DEFAULT_CENTER;

            const newMap = new Map(mapRef.current as HTMLElement, {
                center,
                zoom: 13,
                mapId: process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "NEARSPOTTY_MAP_ID",
                disableDefaultUI: false,
                zoomControl: true,
                streetViewControl: false,
                mapTypeControl: false,
            });

            setMap(newMap);
            if (onLoad) onLoad(newMap);
        }).catch((e: unknown) => console.error("Error loading Google Maps", e));
    }, [map, onLoad, initialCenter]);

    // Update or create Blue Dot user marker
    useEffect(() => {
        if (!map || !userLocation) return;

        const updateUserMarker = async () => {
            try {
                const { AdvancedMarkerElement } = await google.maps.importLibrary("marker") as google.maps.MarkerLibrary;

                // Remove existing marker
                if (userMarkerRef.current) {
                    userMarkerRef.current.map = null;
                }

                // Create Blue Dot element
                const blueDot = document.createElement("div");
                blueDot.innerHTML = `
                    <div style="
                        width: 20px;
                        height: 20px;
                        background: #4285F4;
                        border: 3px solid white;
                        border-radius: 50%;
                        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                    "></div>
                `;

                // Create marker at user's position
                userMarkerRef.current = new AdvancedMarkerElement({
                    position: userLocation,
                    map: map,
                    title: "Your location",
                    content: blueDot.firstElementChild as HTMLElement,
                    zIndex: 1000, // Above other markers
                });
            } catch (error) {
                console.error("[Map] Failed to create user marker:", error);
            }
        };

        updateUserMarker();
    }, [map, userLocation]);

    return <div ref={mapRef} className={`h-full w-full rounded-xl overflow-hidden shadow-sm ${className}`} />;
}

