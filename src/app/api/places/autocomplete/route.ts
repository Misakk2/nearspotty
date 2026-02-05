
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const input = searchParams.get("input");
    const sessionToken = searchParams.get("sessionToken");

    // Optional: Location bias
    // We can accept lat/lng/radius or bias object if needed.
    // For now, let's keep it simple or forward params.

    if (!input) {
        return NextResponse.json({ error: "Missing input" }, { status: 400 });
    }

    if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY) {
        return NextResponse.json({ error: "Missing API configuration" }, { status: 500 });
    }

    try {
        const url = "https://places.googleapis.com/v1/places:autocomplete";

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY,
            },
            body: JSON.stringify({
                input,
                sessionToken: sessionToken || undefined,
                // Include Query Autocomplete features? 
                // Using "includeQueryPredictions": true is optional but good for general search.
                // But specifically for Locations/Cities, we might want to restrict types.
                // User requirement: "Localita Selector". Usually cities/regions.
                includedPrimaryTypes: ["locality", "administrative_area_level_1", "administrative_area_level_2", "country"],
                locationBias: {
                    circle: {
                        center: { latitude: 48.669, longitude: 19.699 }, // Central Slovakia Bias
                        radius: 50000 // 50km radius (API max)
                    }
                }
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[Places Autocomplete Proxy] Error:", response.status, errorText);
            return NextResponse.json({ error: "Places API Error" }, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error("[Places Autocomplete Proxy] Exception:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
