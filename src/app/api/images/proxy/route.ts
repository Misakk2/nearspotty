import { NextRequest, NextResponse } from "next/server";
import { getCachedPhotoUrl } from "@/lib/image-cache";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const placeId = searchParams.get("id");
    const photoReference = searchParams.get("ref");
    const widthParam = searchParams.get("width");
    const maxWidth = widthParam ? parseInt(widthParam) : 800;

    if (!placeId || !photoReference) {
        return new NextResponse("Missing id or ref", { status: 400 });
    }

    try {
        // This function handles deduplication (locking) and caching (GCS)
        // It returns a public URL (GCS or Google falllback)
        const finalUrl = await getCachedPhotoUrl(placeId, photoReference, maxWidth);

        // 307 Temporary Redirect - Browser will follow this to the actual image
        return NextResponse.redirect(finalUrl, { status: 307 });
    } catch (error) {
        console.error("[ImageProxy] Error:", error);
        // Fallback to a placeholder on error
        return NextResponse.redirect(`https://placehold.co/600x400/grey/white?text=Image+Error`, { status: 307 });
    }
}
