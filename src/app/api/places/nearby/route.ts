import { NextRequest, NextResponse } from "next/server";

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
        return NextResponse.json(data);
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: "Failed to fetch places" }, { status: 500 });
    }
}
