import { Place } from "@/types/place";
import { Star, MapPin, Lock, Crown, Clock, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserPreferences, GeminiScore } from "@/types";
import { MatchScoreBadge } from "./MatchScoreBadge";
import { usePlaceStore } from "@/store/place-store";

export interface PlaceCardProps {
    place: Place;
    onClick?: () => void;
    onBeforeNavigate?: () => void; // Called before navigating to detail page
    preferences?: UserPreferences | null;
    score?: GeminiScore | null; // Score from batch-scoring
    scoringLoading?: boolean;
    limitReached?: boolean;
    isMobile?: boolean;
    userLocation?: { lat: number; lng: number };
}

export default function PlaceCard({
    place,
    onClick,
    onBeforeNavigate,
    score,
    scoringLoading = false,
    limitReached = false,
    isMobile,
    userLocation
}: PlaceCardProps) {

    // STICT COMPLIANCE: Prioritize proxyPhotoUrl to avoid Google billing leaks
    const photoUrl = place.proxyPhotoUrl || place.imageSrc || "/placeholder-restaurant.jpg";

    const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371; // Radius of the earth in km
        const dLat = deg2rad(lat2 - lat1);
        const dLon = deg2rad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const d = R * c; // Distance in km
        return d.toFixed(1);
    };

    const deg2rad = (deg: number) => {
        return deg * (Math.PI / 180);
    };

    const distance = userLocation && place.geometry?.location
        ? calculateDistance(userLocation.lat, userLocation.lng, place.geometry.location.lat, place.geometry.location.lng)
        : null;

    const setPlace = usePlaceStore((state) => state.setPlace);

    const handleClick = (e: React.MouseEvent) => {
        // Cache the place data instantly for 0ms navigation
        setPlace(place);

        // Save scroll position before navigation
        if (onBeforeNavigate) {
            onBeforeNavigate();
        }
        if (onClick) {
            onClick();
        }
    };

    return (
        <Link href={`/place/${place.place_id}`} className="block" onClick={handleClick}>
            <Card
                className={`hover:shadow-md transition-shadow cursor-pointer overflow-hidden border-none shadow-sm bg-card group ${isMobile ? 'flex flex-row h-32' : 'flex flex-col'}`}
            >
                <div className="flex flex-row md:flex-col h-32 md:h-auto">
                    {/* Image */}
                    <div className={`w-32 md:w-full h-full md:h-40 shrink-0 bg-gray-200 relative ${isMobile ? 'w-32 h-32' : ''}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photoUrl} alt={place.name} className="w-full h-full object-cover" loading="lazy" />

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
                            ) : (limitReached || place.isGeneric) ? (
                                /* Limit reached or Generic Mode - show upgrade badge */
                                <div className="bg-amber-500 text-white text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-md">
                                    <Lock className="h-3 w-3" />
                                </div>
                            ) : null}
                        </div>
                    </div>

                    {/* Content */}
                    <CardContent className="flex-1 p-3 flex flex-col justify-between relative">
                        <div>
                            <div className="flex justify-between items-start">
                                <div className="flex flex-col items-start gap-1 w-full">
                                    {place.isExactMatch === false ? (
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 uppercase tracking-wide">
                                            Alternative Suggestion
                                        </span>
                                    ) : place.isExactMatch === true ? (
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700 uppercase tracking-wide">
                                            Exact Match
                                        </span>
                                    ) : null}
                                    <h3 className="font-semibold text-sm line-clamp-1">{place.name || "Unknown Place"}</h3>
                                </div>
                            </div>

                            <div className="flex items-center text-xs text-muted-foreground mt-1">
                                <span className="text-yellow-500 font-bold flex items-center mr-1">
                                    {place.rating} <Star className="h-3 w-3 fill-current ml-0.5" />
                                </span>
                                <span>({place.user_ratings_total})</span>
                                <span className="mx-1">•</span>
                                <span>{place.types[0]?.replace("_", " ")}</span>
                                {place.price_level !== undefined && (
                                    <>
                                        <span className="mx-1">•</span>
                                        <span>{"€".repeat(place.price_level)}</span>
                                    </>
                                )}
                            </div>

                            <div className="flex items-center text-xs text-muted-foreground mt-1 line-clamp-1">
                                <MapPin className="h-3 w-3 mr-1 shrink-0" />
                                <span className="truncate">{place.formatted_address || place.vicinity}</span>
                                {distance && <span className="ml-1 font-medium text-primary">• {distance} km</span>}
                            </div>
                        </div>

                        {/* AI Analysis Result or Upgrade CTA */}
                        <div className="mt-3">
                            {score ? (
                                <div className={`p-2 rounded-md border ${score.warning ? "bg-red-50 border-red-200" : "bg-primary/5 border-primary/10"}`}>
                                    {score.warning && (
                                        <div className="flex items-center gap-2 mb-1.5 pb-1.5 border-b border-red-200">
                                            <AlertTriangle className="h-3 w-3 text-red-600 shrink-0" />
                                            <span className="text-[10px] font-bold text-red-700">Dietary Warning</span>
                                        </div>
                                    )}
                                    <p className="text-[10px] text-gray-700 line-clamp-2 leading-tight">
                                        <span className="font-semibold text-primary">AI:</span> {score.shortReason}
                                    </p>
                                    {score.recommendedDish && (
                                        <p className="text-[9px] text-gray-500 mt-1 truncate">
                                            🍽️ Try: {score.recommendedDish}
                                        </p>
                                    )}
                                    {/* Pros and Cons */}
                                    {(score.pros?.length > 0 || score.cons?.length > 0) && (
                                        <div className="mt-2 grid grid-cols-2 gap-2">
                                            {score.pros?.length > 0 && (
                                                <div>
                                                    <p className="text-[9px] font-semibold text-green-700 mb-0.5">Pros</p>
                                                    <ul className="list-disc list-inside text-[9px] text-gray-600 leading-tight">
                                                        {score.pros.slice(0, 2).map((pro, i) => (
                                                            <li key={i} className="truncate">{pro}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                            {score.cons?.length > 0 && (
                                                <div>
                                                    <p className="text-[9px] font-semibold text-red-700 mb-0.5">Cons</p>
                                                    <ul className="list-disc list-inside text-[9px] text-gray-600 leading-tight">
                                                        {score.cons.slice(0, 2).map((con, i) => (
                                                            <li key={i} className="truncate">{con}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (limitReached || place.isGeneric) ? (
                                <div className="bg-gray-50 p-2 rounded-md border border-gray-200 flex flex-col items-start gap-1">
                                    <div className="flex items-center gap-1 text-[10px] font-medium text-gray-500">
                                        <Lock className="h-3 w-3" />
                                        <span>Basic Result</span>
                                    </div>
                                    <p className="text-[10px] text-primary font-semibold">
                                        ✨ Upgrade to see AI match score
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
