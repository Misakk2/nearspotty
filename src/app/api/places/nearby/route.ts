import { NextRequest, NextResponse } from "next/server";
import { getCache, setCache, createCacheKey } from "@/lib/cache-utils";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    const radius = searchParams.get("radius") || "5000";
    const type = searchParams.get("type") || "restaurant";
    const keyword = searchParams.get("keyword") || "";

    if (!process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY) {
        return NextResponse.json({ error: "Missing API Key" }, { status: 500 });
    }

    // Create a cache key based on params
    const cacheKey = createCacheKey({ lat, lng, radius, type, keyword });
    const cachedData = await getCache("places_nearby_cache", cacheKey);

    if (cachedData) {
        return NextResponse.json(cachedData);
    }

    // If we have a keyword, we might want Text Search, otherwise Nearby Search
    const baseUrl = keyword
        ? "https://maps.googleapis.com/maps/api/place/textsearch/json"
        : "https://maps.googleapis.com/maps/api/place/nearbysearch/json";

    const url = new URL(baseUrl);
    url.searchParams.append("key", process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY);

    if (keyword) {
        url.searchParams.append("query", keyword);
        if (lat && lng) {
            url.searchParams.append("location", `${lat},${lng}`);
            url.searchParams.append("radius", radius);
        }
    } else if (lat && lng) {
        url.searchParams.append("location", `${lat},${lng}`);
        url.searchParams.append("radius", radius);
        url.searchParams.append("type", type);
    } else {
        return NextResponse.json({ error: "Location or Keyword required" }, { status: 400 });
    }

    try {
        const res = await fetch(url.toString());
        const data = await res.json();

        // Cache successful response for 24 hours
        if (data.status === "OK") {
            await setCache("places_nearby_cache", cacheKey, data);
        } else {
            console.error(`Google Places API Error: ${data.status}`, data.error_message);
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: "Failed to fetch places" }, { status: 500 });
    }
}
