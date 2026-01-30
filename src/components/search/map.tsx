"use client";

import { useEffect, useRef, useState } from "react";
import loader from "@/lib/google-maps";
import { getLocationFromIP } from "@/lib/ip-geolocation";

interface MapProps {
    className?: string;
    onLoad?: (map: google.maps.Map) => void;
    /** Initial center coordinates. If not provided, will try device geolocation first. */
    initialCenter?: { lat: number; lng: number };
}

// Default fallback location (Bratislava)
const DEFAULT_CENTER = { lat: 48.1486, lng: 17.1077 };

export default function Map({ className, onLoad, initialCenter }: MapProps) {
    const mapRef = useRef<HTMLDivElement>(null);
    const [map, setMap] = useState<google.maps.Map | null>(null);

    useEffect(() => {
        if (!mapRef.current || map) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (loader as any).importLibrary("maps").then(async () => {
            const { Map } = await google.maps.importLibrary("maps") as google.maps.MapsLibrary;

            // Determine initial center: prop > device geolocation > IP geolocation > default
            let center = initialCenter || DEFAULT_CENTER;

            // If no initialCenter provided, try device geolocation first
            if (!initialCenter && navigator.geolocation) {
                try {
                    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject, {
                            enableHighAccuracy: true,
                            timeout: 5000,
                            maximumAge: 60000
                        });
                    });
                    center = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    console.log("[Map] Using device geolocation");
                } catch (geoError) {
                    // Geolocation failed - try IP fallback
                    console.log("[Map] Device geolocation failed, trying IP fallback...", geoError);
                    try {
                        const ipLocation = await getLocationFromIP();
                        if (ipLocation) {
                            center = { lat: ipLocation.lat, lng: ipLocation.lng };
                            console.log(`[Map] Using IP geolocation: ${ipLocation.city}`);
                        }
                    } catch (ipError) {
                        console.log("[Map] IP geolocation also failed, using default center", ipError);
                    }
                }
            }

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

    return <div ref={mapRef} className={`h-full w-full rounded-xl overflow-hidden shadow-sm ${className}`} />;
}
