import { getPlaceDetails } from "@/lib/place-service";
import PlaceDetailsClient from "./place-client";


interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function PlaceDetailPage({ params }: PageProps) {
    const { id } = await params;

    let place = null;
    let error = null;

    try {
        place = await getPlaceDetails(id);
    } catch (err) {
        console.error("Error fetching place:", err);
        error = "Failed to load place details";
    }

    if (error || !place) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center bg-gray-50">
                <p className="text-lg text-muted-foreground mb-4">
                    {error || "Place not found"}
                </p>
                {/* Could add a 'Go Back' button here if we had a client component wrapper or Link */}
            </div>
        );
    }

    return <PlaceDetailsClient place={place} />;
}
