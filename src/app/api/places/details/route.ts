import { NextRequest, NextResponse } from "next/server";
import { getPlaceDetails } from "@/lib/place-service";

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const placeId = searchParams.get("place_id");

    if (!placeId) {
        return NextResponse.json({ error: "Missing place_id parameter" }, { status: 400 });
    }

    try {
        const place = await getPlaceDetails(placeId);
        return NextResponse.json(place);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error("[Details API] Exception:", error);
        return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
    }
}
