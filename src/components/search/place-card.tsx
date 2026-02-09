import { Place } from "@/types/place";
import { Star, MapPin, Lock, Clock, AlertTriangle, Navigation, Globe, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { UserPreferences, GeminiScore } from "@/types";
import { MatchScoreBadge } from "./MatchScoreBadge";
import { usePlaceStore } from "@/store/place-store";
import { useState, useEffect, useRef } from "react";
import { CategoryPlaceholder } from "@/components/CategoryPlaceholder";

export interface PlaceCardProps {
    place: Place;
    onClick?: () => void;
    onBeforeNavigate?: () => void;
    preferences?: UserPreferences | null;
    score?: GeminiScore | null;
    scoringLoading?: boolean;
    limitReached?: boolean;
    isMobile?: boolean;
    userLocation?: { lat: number; lng: number };
    /** If true, this is a survival/compromise option (no perfect dietary match found) */
    isSurvivalOption?: boolean;
    /** Reason why this was chosen as survival option (e.g., "Italian - pasta options") */
    survivalReason?: string;
}

export default function PlaceCard({
    place,
    onClick,
    onBeforeNavigate,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    preferences,
    score,
    scoringLoading = false,
    limitReached = false,
    // isMobile prop removed - using Tailwind responsive classes instead
    userLocation,
    isSurvivalOption = false,
    survivalReason
}: PlaceCardProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);
    const setPlace = usePlaceStore((state) => state.setPlace);
    const router = useRouter();

    // Check if we have a valid photo URL (not a placeholder)
    const validPhotoUrl = place.proxyPhotoUrl || place.imageSrc;
    const hasValidPhoto = Boolean(validPhotoUrl && !validPhotoUrl.includes('placeholder'));

    const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371;
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return (R * c).toFixed(1);
    };

    const distance = userLocation && place.geometry?.location
        ? calculateDistance(userLocation.lat, userLocation.lng, place.geometry.location.lat, place.geometry.location.lng)
        : null;

    // Collapse on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (cardRef.current && !cardRef.current.contains(event.target as Node) && isExpanded) {
                setIsExpanded(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isExpanded]);

    const handleCardClick = (e: React.MouseEvent) => {
        // Ignore clicks from action buttons (Navigate, View Details, etc.)
        const target = e.target as HTMLElement;
        if (target.closest('a, button[data-action], [data-action]')) {
            return;
        }

        if (!isExpanded) {
            e.preventDefault();
            setIsExpanded(true);
            onClick?.();
        } else {
            setPlace(place);
            onBeforeNavigate?.();
            router.push(`/place/${place.place_id}`);
        }
    };

    const getClosingTime = (): string | null => {
        if (!place.opening_hours?.weekday_text) return null;
        const today = new Date().getDay();
        const adjustedDay = today === 0 ? 6 : today - 1;
        const todayText = place.opening_hours.weekday_text[adjustedDay];
        if (todayText) {
            const match = todayText.match(/–\s*(.+)$/);
            if (match) return match[1].trim();
        }
        return null;
    };

    const closingTime = getClosingTime();
    const googleMapsUrl = place.geometry?.location
        ? `https://www.google.com/maps/dir/?api=1&destination=${place.geometry.location.lat},${place.geometry.location.lng}&destination_place_id=${place.place_id}`
        : null;

    const cardContent = (
        <Card className={`hover:shadow-md transition-all cursor-pointer overflow-hidden border-none shadow-sm bg-card group flex flex-col ${isExpanded ? 'ring-2 ring-primary shadow-lg' : ''}`}>
            {/* MOBILE: Vertical stack (flex-col) | DESKTOP: Horizontal (md:flex-row) */}
            <div className="flex flex-col">
                {/* Image - Full width on mobile, fixed width on desktop */}
                <div className="w-full h-44 md:h-32 shrink-0 bg-gray-200 relative">
                    {hasValidPhoto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={validPhotoUrl!} alt={place.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                        <CategoryPlaceholder types={place.types} className="w-full h-full" />
                    )}

                    {place.opening_hours?.open_now !== undefined && (
                        <div className="absolute top-2 left-2">
                            <Popover>
                                <PopoverTrigger asChild onClick={(e) => e.preventDefault()}>
                                    <button type="button" className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold cursor-pointer ${place.opening_hours.open_now ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'} text-white border-none`}>
                                        <Clock className="h-3 w-3" />
                                        {place.opening_hours.open_now ? 'Open' : 'Closed'}
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-64 p-3" onClick={(e) => e.stopPropagation()}>
                                    <div className="space-y-2">
                                        <h4 className="font-medium text-sm flex items-center gap-2">
                                            <Clock className="h-4 w-4" /> Opening Hours
                                        </h4>
                                        {place.opening_hours.weekday_text?.length ? (
                                            <ul className="text-xs space-y-1">
                                                {place.opening_hours.weekday_text.map((day, idx) => {
                                                    const today = new Date().getDay();
                                                    const isToday = (idx + 1) % 7 === today;
                                                    return (
                                                        <li key={idx} className={`${isToday ? 'font-semibold text-primary bg-primary/5 px-2 py-1 rounded' : 'text-muted-foreground'}`}>
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

                    <div className="absolute top-2 right-2">
                        {scoringLoading ? (
                            <div className="w-10 h-10 rounded-full bg-gray-300/80 animate-pulse" />
                        ) : score && typeof score.matchScore === 'number' ? (
                            <MatchScoreBadge score={score.matchScore} size="sm" />
                        ) : (limitReached || place.isGeneric) ? (
                            <div className="bg-amber-500 text-white text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-md">
                                <Lock className="h-3 w-3" />
                            </div>
                        ) : null}
                    </div>

                    {/* Basic View indicator for light results without AI */}
                    {place.isGeneric && (
                        <div className="absolute bottom-2 left-2 bg-gray-800/80 text-white text-[9px] px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Lock className="h-2.5 w-2.5" />
                            <span>Basic View</span>
                        </div>
                    )}
                </div>

                {/* Content */}
                <CardContent className="flex-1 p-3 flex flex-col justify-between relative">
                    <div>
                        <div className="flex justify-between items-start">
                            <div className="flex flex-col items-start gap-1 w-full">
                                {/* Survival Option Label (highest priority) */}
                                {isSurvivalOption ? (
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 uppercase tracking-wide">
                                            🎯 Best Alternative Nearby
                                        </span>
                                        {survivalReason && (
                                            <span className="text-[9px] text-amber-600 italic pl-1">
                                                {survivalReason}
                                            </span>
                                        )}
                                    </div>
                                ) : place.isExactMatch === false ? (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 uppercase tracking-wide">Alternative Suggestion</span>
                                ) : place.isExactMatch === true ? (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700 uppercase tracking-wide">Exact Match</span>
                                ) : null}
                                <h3 className="font-semibold text-sm line-clamp-1">{place.name || "Unknown Place"}</h3>
                            </div>
                            {isExpanded && (
                                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsExpanded(false); }} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
                                    <X className="h-4 w-4 text-gray-500" />
                                </button>
                            )}
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

                        {isExpanded && closingTime && place.opening_hours?.open_now && (
                            <div className="flex items-center text-xs text-amber-600 mt-2 font-medium">
                                <Clock className="h-3 w-3 mr-1" />
                                Closes at {closingTime}
                            </div>
                        )}
                    </div>

                    {/* MOBILE: Always Visible Action Buttons (no tap required) */}
                    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100 md:hidden">
                        {googleMapsUrl && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 h-9 text-xs"
                                data-action="navigate"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    window.open(googleMapsUrl, '_blank');
                                }}
                            >
                                <Navigation className="h-3.5 w-3.5 mr-1" /> Navigate
                            </Button>
                        )}
                        <Link
                            href={`/place/${place.place_id}`}
                            className="flex-1"
                            data-action="view-details"
                            prefetch={false}
                            onClick={(e) => {
                                e.stopPropagation();
                                setPlace(place);
                                onBeforeNavigate?.();
                            }}
                        >
                            <Button size="sm" className="w-full h-9 text-xs bg-primary">
                                View Details
                            </Button>
                        </Link>
                    </div>

                    {/* DESKTOP: Quick Actions (expanded only) */}
                    {isExpanded && (
                        <div className="hidden md:flex gap-2 mt-3 pt-3 border-t border-gray-100">
                            {googleMapsUrl && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="flex-1 h-8 text-xs"
                                    data-action="navigate"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        window.open(googleMapsUrl, '_blank');
                                    }}
                                >
                                    <Navigation className="h-3 w-3 mr-1" /> Navigate
                                </Button>
                            )}
                            {place.website && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="flex-1 h-8 text-xs"
                                    data-action="website"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        window.open(place.website, '_blank');
                                    }}
                                >
                                    <Globe className="h-3 w-3 mr-1" /> Website
                                </Button>
                            )}
                            <Link
                                href={`/place/${place.place_id}`}
                                className="flex-1"
                                data-action="view-details"
                                prefetch={false}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setPlace(place);
                                    onBeforeNavigate?.();
                                }}
                            >
                                <Button size="sm" className="w-full h-8 text-xs bg-primary">
                                    View Details
                                </Button>
                            </Link>
                        </div>
                    )}

                    {/* AI Analysis (not expanded) */}
                    {!isExpanded && (
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
                                        <p className="text-[9px] text-gray-500 mt-1 truncate">🍽️ Try: {score.recommendedDish}</p>
                                    )}
                                    {(score.pros?.length > 0 || score.cons?.length > 0) && (
                                        <div className="mt-2 grid grid-cols-2 gap-2">
                                            {score.pros?.length > 0 && (
                                                <div>
                                                    <p className="text-[9px] font-semibold text-green-700 mb-0.5">Pros</p>
                                                    <ul className="list-disc list-inside text-[9px] text-gray-600 leading-tight">
                                                        {score.pros.slice(0, 2).map((pro, i) => <li key={i} className="truncate">{pro}</li>)}
                                                    </ul>
                                                </div>
                                            )}
                                            {score.cons?.length > 0 && (
                                                <div>
                                                    <p className="text-[9px] font-semibold text-red-700 mb-0.5">Cons</p>
                                                    <ul className="list-disc list-inside text-[9px] text-gray-600 leading-tight">
                                                        {score.cons.slice(0, 2).map((con, i) => <li key={i} className="truncate">{con}</li>)}
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
                                    <p className="text-[10px] text-primary font-semibold">✨ Upgrade to see AI match score</p>
                                </div>
                            ) : scoringLoading ? (
                                <div className="bg-gray-100 p-2 rounded-md animate-pulse">
                                    <div className="h-3 bg-gray-200 rounded w-3/4 mb-1" />
                                    <div className="h-2 bg-gray-200 rounded w-1/2" />
                                </div>
                            ) : null}
                        </div>
                    )}
                </CardContent>
            </div>
        </Card>
    );

    return (
        <div
            ref={cardRef}
            className="relative cursor-pointer"
            onClick={handleCardClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleCardClick(e as unknown as React.MouseEvent);
                }
            }}
        >
            {cardContent}
        </div>
    );
}
