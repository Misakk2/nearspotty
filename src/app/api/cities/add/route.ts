import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

/**
 * Secure City Addition API
 * 
 * Flow:
 * 1. User sends Place ID (from Google Facade on client)
 * 2. Server validates User Auth
 * 3. Server fetches full Place Details from Google (Trusted Source)
 * 4. Server writes to Firestore (Admin SDK)
 */
export async function POST(request: NextRequest) {
    // 1. Auth Check
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const token = authHeader.split("Bearer ")[1];
        await getAdminAuth().verifyIdToken(token);
    } catch {
        return NextResponse.json({ error: "Invalid Token" }, { status: 401 });
    }

    // 2. Input Validation
    const body = await request.json();
    const { placeId } = body;

    if (!placeId) {
        return NextResponse.json({ error: "Missing placeId" }, { status: 400 });
    }

    // 3. Idempotency Check (Don't double-charge/double-write)
    // We use the Place ID as the document ID for 'cities'
    const cityRef = getAdminDb().collection("cities").doc(placeId);
    const doc = await cityRef.get();

    if (doc.exists) {
        return NextResponse.json({
            success: true,
            message: "City already exists",
            city: doc.data()
        });
    }

    // 4. Fetch Trusted Data from Google Places API (New V1 API)
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY; // or specific Server Key if preferred
    if (!apiKey) {
        return NextResponse.json({ error: "Server Configuration Error" }, { status: 500 });
    }

    try {
        // Fetch specific fields needed for the City object
        const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": apiKey,
                "X-Goog-FieldMask": "id,name,location,photos,addressComponents"
            }
        });

        if (!response.ok) {
            throw new Error(`Google API Error: ${response.statusText}`);
        }

        const data = await response.json();

        // 5. Construct City Object
        // Extract Country/Short Name
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const countryComponent = data.addressComponents?.find((c: any) =>
            c.types.includes("country")
        );

        const newCity = {
            name: data.name,
            location: {
                lat: data.location.latitude,
                lng: data.location.longitude
            },
            country: countryComponent?.longText || "Unknown",
            countryCode: countryComponent?.shortText || "XX",
            placeId: data.id,
            photoReference: data.photos?.[0]?.name ?? null,
            isActive: true,
            createdAt: new Date().toISOString()
        };

        // 6. Write to Firestore (Admin SDK bypasses 'allow write: false')
        await cityRef.set(newCity);

        return NextResponse.json({
            success: true,
            message: "City added successfully",
            city: newCity
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error("Add City Error:", error);
        return NextResponse.json({ error: error.message || "Failed to add city" }, { status: 500 });
    }
}
