import { Place } from "@/types/place";
import { Star, MapPin, Lock, Crown, Clock } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserPreferences, GeminiScore } from "@/types";
import { MatchScoreBadge } from "./MatchScoreBadge";

export interface PlaceCardProps {
    place: Place;
    onClick?: () => void;
    preferences?: UserPreferences | null;
    score?: GeminiScore | null; // Score from batch-scoring
    scoringLoading?: boolean;
    limitReached?: boolean;
}

export default function PlaceCard({
    place,
    onClick,
    score,
    scoringLoading = false,
    limitReached = false
}: PlaceCardProps) {

    const photoUrl = place.photos?.[0]?.photo_reference
        ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${place.photos[0].photo_reference}&key=${process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY}`
        : "/placeholder-restaurant.jpg";

    return (
        <Link href={`/place/${place.place_id}`} className="block">
            <Card
                className="hover:shadow-md transition-shadow cursor-pointer overflow-hidden border-none shadow-sm bg-card group"
                onClick={onClick}
            >
                <div className="flex flex-row md:flex-col h-32 md:h-auto">
                    {/* Image */}
                    <div className="w-32 md:w-full h-full md:h-40 shrink-0 bg-gray-200 relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photoUrl} alt={place.name} className="w-full h-full object-cover" />

                        {/* Opening Hours Badge with Popover */}
                        {place.opening_hours?.open_now !== undefined && (
                            <div className="absolute top-2 left-2">
                                <Popover>
                                    <PopoverTrigger asChild onClick={(e) => e.preventDefault()}>
                                        <button
                                            type="button"
                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold cursor-pointer ${place.opening_hours.open_now ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'} text-white border-none`}
                                        >
                                            <Clock className="h-3 w-3" />
                                            {place.opening_hours.open_now ? 'Open' : 'Closed'}
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-64 p-3" onClick={(e) => e.stopPropagation()}>
                                        <div className="space-y-2">
                                            <h4 className="font-medium text-sm flex items-center gap-2">
                                                <Clock className="h-4 w-4" />
                                                Opening Hours
                                            </h4>
                                            {place.opening_hours.weekday_text?.length ? (
                                                <ul className="text-xs space-y-1">
                                                    {place.opening_hours.weekday_text.map((day, idx) => {
                                                        const today = new Date().getDay();
                                                        // weekday_text starts with Sunday=0, but array starts with Monday
                                                        const isToday = (idx + 1) % 7 === today;
                                                        return (
                                                            <li
                                                                key={idx}
                                                                className={`${isToday ? 'font-semibold text-primary bg-primary/5 px-2 py-1 rounded' : 'text-muted-foreground'}`}
                                                            >
                                                                {day}
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            ) : (
                                                <p className="text-xs text-muted-foreground">Hours not available</p>
                                            )}
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        )}

                        {/* Match Score Badge / Loading / Locked State */}
                        <div className="absolute top-2 right-2">
                            {scoringLoading ? (
                                /* Skeleton loading state */
                                <div className="w-10 h-10 rounded-full bg-gray-300/80 animate-pulse" />
                            ) : score && typeof score.matchScore === 'number' ? (
                                <MatchScoreBadge score={score.matchScore} size="sm" />
                            ) : limitReached ? (
                                /* Limit reached - show upgrade badge */
                                <div className="bg-amber-500 text-white text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-md">
                                    <Lock className="h-3 w-3" />
                                    <Crown className="h-3 w-3" />
                                </div>
                            ) : null}
                        </div>
                    </div>

                    {/* Content */}
                    <CardContent className="flex-1 p-3 flex flex-col justify-between relative">
                        <div>
                            <div className="flex justify-between items-start">
                                <h3 className="font-semibold text-sm line-clamp-1">{place.name}</h3>
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

                        {/* AI Analysis Result or Upgrade CTA */}
                        <div className="mt-3">
                            {score ? (
                                <div className="bg-primary/5 p-2 rounded-md border border-primary/10">
                                    <p className="text-[10px] text-gray-700 line-clamp-2 leading-tight">
                                        <span className="font-semibold text-primary">AI:</span> {score.shortReason}
                                    </p>
                                    {score.recommendedDish && (
                                        <p className="text-[9px] text-gray-500 mt-1 truncate">
                                            🍽️ Try: {score.recommendedDish}
                                        </p>
                                    )}
                                </div>
                            ) : limitReached ? (
                                <div className="bg-amber-50 p-2 rounded-md border border-amber-200 text-center">
                                    <p className="text-[10px] text-amber-700 font-medium">
                                        🔒 Upgrade to Premium for AI match scores
                                    </p>
                                </div>
                            ) : scoringLoading ? (
                                <div className="bg-gray-100 p-2 rounded-md animate-pulse">
                                    <div className="h-3 bg-gray-200 rounded w-3/4 mb-1" />
                                    <div className="h-2 bg-gray-200 rounded w-1/2" />
                                </div>
                            ) : null}
                        </div>
                    </CardContent>
                </div>
            </Card>
        </Link>
    );
}
