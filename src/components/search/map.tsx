"use client";

import { useEffect, useRef, useState } from "react";
import loader from "@/lib/google-maps";

interface MapProps {
    className?: string;
    onLoad?: (map: google.maps.Map) => void;
}

export default function Map({ className, onLoad }: MapProps) {
    const mapRef = useRef<HTMLDivElement>(null);
    const [map, setMap] = useState<google.maps.Map | null>(null);

    useEffect(() => {
        if (!mapRef.current || map) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (loader as any).importLibrary("maps").then(async () => {
            const { Map } = await google.maps.importLibrary("maps") as google.maps.MapsLibrary;

            const newMap = new Map(mapRef.current as HTMLElement, {
                center: { lat: 48.1486, lng: 17.1077 }, // Default to Bratislava (or any default)
                zoom: 13,
                mapId: "NEARSPOTTY_MAP_ID", // Optional: use a real Map ID for advanced markers
                disableDefaultUI: false,
                zoomControl: true,
                streetViewControl: false,
                mapTypeControl: false,
            });

            setMap(newMap);
            if (onLoad) onLoad(newMap);
        }).catch((e: unknown) => console.error("Error loading Google Maps", e));
    }, [map, onLoad]);

    return <div ref={mapRef} className={`h-full w-full rounded-xl overflow-hidden shadow-sm ${className}`} />;
}
