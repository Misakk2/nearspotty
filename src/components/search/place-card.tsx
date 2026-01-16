import { Place } from "@/types/place";
import { Star, MapPin, Sparkles, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserPreferences, GeminiScore } from "@/types";
import toast from "react-hot-toast";

interface PlaceCardProps {
    place: Place;
    onClick?: () => void;
    preferences?: UserPreferences | null;
}

export default function PlaceCard({ place, onClick, preferences }: PlaceCardProps) {
    const [scoreData, setScoreData] = useState<GeminiScore | null>(null);
    const [loadingScore, setLoadingScore] = useState(false);

    const photoUrl = place.photos?.[0]?.photo_reference
        ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${place.photos[0].photo_reference}&key=${process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY}`
        : "/placeholder-restaurant.jpg";

    const handleAnalyze = async (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent triggering card click
        if (!preferences) {
            toast.error("Please log in to check compatibility.");
            return;
        }

        setLoadingScore(true);
        try {
            const res = await fetch("/api/gemini/score", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    placeId: place.place_id,
                    name: place.name,
                    dietary: preferences
                })
            });
            const data = await res.json();
            if (res.ok) {
                setScoreData(data);
            } else {
                console.error("Score fetch failed", data);
                toast.error("Failed to analyze.");
            }
        } catch (error) {
            console.error(error);
            toast.error("Network error.");
        } finally {
            setLoadingScore(false);
        }
    };

    return (
        <Card className="hover:shadow-md transition-shadow cursor-pointer overflow-hidden border-none shadow-sm bg-card group" onClick={onClick}>
            <div className="flex flex-row md:flex-col h-32 md:h-auto">
                {/* Image */}
                <div className="w-32 md:w-full h-full md:h-40 shrink-0 bg-gray-200 relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoUrl} alt={place.name} className="w-full h-full object-cover" />
                    {place.opening_hours?.open_now && (
                        <Badge className="absolute top-2 left-2 bg-green-500 hover:bg-green-600 text-white border-none">Open</Badge>
                    )}
                </div>

                {/* Content */}
                <CardContent className="flex-1 p-3 flex flex-col justify-between relative">
                    <div>
                        <div className="flex justify-between items-start">
                            <Link href={`/place/${place.place_id}`} className="hover:underline">
                                <h3 className="font-semibold text-sm line-clamp-1">{place.name}</h3>
                            </Link>
                            {scoreData?.dietaryScore && (
                                <Badge className={`${scoreData.dietaryScore >= 4 ? "bg-green-500" :
                                        scoreData.dietaryScore >= 2.5 ? "bg-yellow-500" : "bg-red-500"
                                    } text-[10px] px-1.5 py-0.5 h-5`}>
                                    {scoreData.dietaryScore}/5
                                </Badge>
                            )}
                        </div>

                        <div className="flex items-center text-xs text-muted-foreground mt-1">
                            <span className="text-yellow-500 font-bold flex items-center mr-1">
                                {place.rating} <Star className="h-3 w-3 fill-current ml-0.5" />
                            </span>
                            <span>({place.user_ratings_total})</span>
                            <span className="mx-1">•</span>
                            <span>{place.types[0]?.replace("_", " ")}</span>
                        </div>

                        <div className="flex items-center text-xs text-muted-foreground mt-1 line-clamp-1">
                            <MapPin className="h-3 w-3 mr-1 shrink-0" />
                            {place.vicinity}
                        </div>
                    </div>

                    {/* AI Analysis / Result */}
                    <div className="mt-3">
                        {scoreData ? (
                            <div className="bg-primary/5 p-2 rounded-md border border-primary/10">
                                <p className="text-[10px] text-gray-700 line-clamp-2 leading-tight">
                                    <span className="font-semibold text-primary">AI:</span> {scoreData.fitReason}
                                </p>
                            </div>
                        ) : (
                            <button
                                onClick={handleAnalyze}
                                disabled={loadingScore}
                                className="w-full mt-1 text-xs bg-primary/10 hover:bg-primary/20 text-primary font-medium py-1.5 rounded-md flex items-center justify-center transition-colors"
                            >
                                {loadingScore ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Sparkles className="h-3 w-3 mr-1" /> Check Suitability</>}
                            </button>
                        )}
                    </div>
                </CardContent>
            </div>
        </Card>
    );
}
