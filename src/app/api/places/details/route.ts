import { NextRequest, NextResponse } from "next/server";
import { getCache, setCache } from "@/lib/cache-utils";

const GOOGLE_PLACES_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY;

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const placeId = searchParams.get("place_id");

    if (!placeId) {
        return NextResponse.json({ error: "Missing place_id parameter" }, { status: 400 });
    }

    if (!GOOGLE_PLACES_API_KEY) {
        return NextResponse.json({ error: "Server misconfigured: Missing Google Places API Key" }, { status: 500 });
    }

    // Check cache
    const cachedData = await getCache("place_details_cache", placeId);
    if (cachedData) {
        return NextResponse.json(cachedData);
    }

    try {
        // Fetch place details
        const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,rating,user_ratings_total,formatted_address,formatted_phone_number,opening_hours,website,photos,geometry,types,price_level,reviews&key=${GOOGLE_PLACES_API_KEY}`;

        const res = await fetch(url);
        const data = await res.json();

        if (data.status !== "OK") {
            return NextResponse.json({ error: data.error_message || "Failed to fetch place details" }, { status: 500 });
        }

        // Cache for 24 hours
        await setCache("place_details_cache", placeId, data.result);

        return NextResponse.json(data.result);
    } catch (error) {
        console.error("Error fetching place details:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
