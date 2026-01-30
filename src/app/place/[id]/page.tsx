"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Place } from "@/types/place";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/components/auth-provider";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { UserPreferences, GeminiScore } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Star, MapPin, Phone, Globe, Clock, ArrowLeft, Sparkles, AlertTriangle, CheckCircle2, ThumbsUp, ThumbsDown, UtensilsCrossed } from "lucide-react";
import { ReservationModal } from "@/components/reservation/reservation-modal";
import { MatchScoreBadge } from "@/components/search/MatchScoreBadge";
import toast from "react-hot-toast";

export default function PlaceDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { user } = useAuth();
    const placeId = params.id as string;

    const [place, setPlace] = useState<Place | null>(null);
    const [loading, setLoading] = useState(true);
    const [preferences, setPreferences] = useState<UserPreferences | null>(null);
    const [aiScore, setAiScore] = useState<GeminiScore | null>(null);
    const [analyzing, setAnalyzing] = useState(false);

    // Fetch User Preferences
    useEffect(() => {
        const fetchPreferences = async () => {
            if (user) {
                try {
                    const docRef = doc(db, "users", user.uid, "preferences", "main");
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        setPreferences(docSnap.data() as UserPreferences);
                    }
                } catch (error) {
                    console.error("Error fetching preferences:", error);
                }
            }
        };
        fetchPreferences();
    }, [user]);

    // Fetch Place Details
    useEffect(() => {
        const fetchPlaceDetails = async () => {
            try {
                const res = await fetch(`/api/places/details?place_id=${placeId}`);
                const data = await res.json();
                if (res.ok) {
                    setPlace(data);
                } else {
                    toast.error(data.error || "Failed to load place");
                }
            } catch (error) {
                console.error(error);
                toast.error("Error loading place details");
            } finally {
                setLoading(false);
            }
        };

        if (placeId) {
            fetchPlaceDetails();
        }
    }, [placeId]);

    // AI Analysis
    const handleAnalyze = async () => {
        if (!preferences || !place) return;
        setAnalyzing(true);
        try {
            const res = await fetch("/api/gemini/score", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    placeId: place.place_id,
                    name: place.name,
                    dietary: preferences,
                    // If place details fetched reviews, pass them to save an API call
                    reviews: place.reviews
                })
            });
            const data = await res.json();
            if (res.ok) {
                setAiScore(data);
                toast.success("AI Analysis Complete!");
            } else {
                toast.error("Analysis failed");
            }
        } catch (error) {
            console.error(error);
            toast.error("Analysis error");
        } finally {
            setAnalyzing(false);
        }
    };

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    if (!place) {
        return <div className="min-h-screen flex items-center justify-center">Place not found</div>;
    }

    const mainPhotoUrl = place.photos?.[0]?.photo_reference
        ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${place.photos[0].photo_reference}&key=${process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY}`
        : "/placeholder-restaurant.jpg";

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Header / Hero */}
            <div className="relative h-64 md:h-80 w-full bg-gray-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mainPhotoUrl} alt={place.name} className="w-full h-full object-cover" />
                <div className="absolute top-4 left-4">
                    <Button variant="secondary" size="sm" onClick={() => router.back()} className="rounded-full">
                        <ArrowLeft className="h-4 w-4 mr-1" /> Back
                    </Button>
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 text-white">
                    <h1 className="text-3xl font-bold">{place.name}</h1>
                    <div className="flex items-center mt-2 text-sm opacity-90">
                        <span className="text-yellow-400 font-bold flex items-center mr-2">
                            {place.rating} <Star className="h-4 w-4 fill-current ml-1" />
                        </span>
                        <span>({place.user_ratings_total} reviews)</span>
                        <span className="mx-2">•</span>
                        <span>{place.types[0]?.replace("_", " ")}</span>
                        {place.price_level && (
                            <>
                                <span className="mx-2">•</span>
                                <span>{"€".repeat(place.price_level)}</span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

                {/* AI Score Section - "Why for You?" */}
                <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 shadow-md overflow-hidden">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-primary" />
                            Why for You?
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {!aiScore ? (
                            <div className="flex flex-col items-center justify-center p-4">
                                <p className="text-muted-foreground mb-4 text-center text-sm">
                                    Get a personalized AI analysis based on your preferences ({preferences?.dietary?.join(", ") || "not set"}).
                                </p>
                                <Button onClick={handleAnalyze} disabled={analyzing || !preferences} className="w-full sm:w-auto">
                                    {analyzing ? (
                                        <> <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing... </>
                                    ) : (
                                        "Check Match"
                                    )}
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-5">
                                {/* Score Header */}
                                <div className="flex items-center gap-4">
                                    <MatchScoreBadge score={aiScore.matchScore} size="lg" />
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-gray-500 mb-1">Match Score</p>
                                        <p className="text-gray-700">{aiScore.shortReason}</p>
                                    </div>
                                </div>

                                {/* Pros & Cons Grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {/* Pros */}
                                    {aiScore.pros && aiScore.pros.length > 0 && (
                                        <div className="bg-green-50/80 rounded-xl p-4 border border-green-100">
                                            <p className="text-xs font-semibold uppercase text-green-700 mb-2 flex items-center gap-1">
                                                <ThumbsUp className="h-3 w-3" /> Pros
                                            </p>
                                            <ul className="space-y-1">
                                                {aiScore.pros.map((pro, i) => (
                                                    <li key={i} className="flex items-start gap-2 text-sm text-green-800">
                                                        <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                                                        {pro}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {/* Cons */}
                                    {aiScore.cons && aiScore.cons.length > 0 && (
                                        <div className="bg-amber-50/80 rounded-xl p-4 border border-amber-100">
                                            <p className="text-xs font-semibold uppercase text-amber-700 mb-2 flex items-center gap-1">
                                                <ThumbsDown className="h-3 w-3" /> Cons
                                            </p>
                                            <ul className="space-y-1">
                                                {aiScore.cons.map((con, i) => (
                                                    <li key={i} className="flex items-start gap-2 text-sm text-amber-800">
                                                        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                                                        {con}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>

                                {/* Recommended Dish */}
                                {aiScore.recommendedDish && (
                                    <div className="bg-white/60 rounded-xl p-4 border border-gray-100">
                                        <p className="text-xs font-semibold uppercase text-gray-500 mb-2 flex items-center gap-1">
                                            <UtensilsCrossed className="h-3 w-3" /> Recommended for You
                                        </p>
                                        <p className="text-gray-800 font-medium">{aiScore.recommendedDish}</p>
                                    </div>
                                )}

                                {/* Warnings */}
                                {aiScore.warnings && aiScore.warnings.length > 0 && (
                                    <div className="bg-red-50/80 rounded-xl p-4 border border-red-100">
                                        <p className="text-xs font-semibold uppercase text-red-700 mb-2 flex items-center gap-1">
                                            <AlertTriangle className="h-3 w-3" /> Warnings
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {aiScore.warnings.map((warn, i) => (
                                                <Badge key={i} variant="outline" className="bg-red-100 text-red-700 border-red-200">
                                                    {warn}
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Info Sidebar */}
                    <div className="space-y-6">
                        <Card>
                            <CardContent className="p-4 space-y-4">
                                <div className="flex items-start gap-3">
                                    <MapPin className="h-5 w-5 text-gray-400 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-sm font-medium">Address</p>
                                        <p className="text-sm text-gray-600">{place.formatted_address}</p>
                                    </div>
                                </div>
                                {place.formatted_phone_number && (
                                    <div className="flex items-start gap-3">
                                        <Phone className="h-5 w-5 text-gray-400 mt-0.5 shrink-0" />
                                        <div>
                                            <p className="text-sm font-medium">Phone</p>
                                            <p className="text-sm text-blue-600">{place.formatted_phone_number}</p>
                                        </div>
                                    </div>
                                )}
                                {place.website && (
                                    <div className="flex items-start gap-3">
                                        <Globe className="h-5 w-5 text-gray-400 mt-0.5 shrink-0" />
                                        <div>
                                            <p className="text-sm font-medium">Website</p>
                                            <a href={place.website} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline truncate block max-w-[200px]">
                                                {new URL(place.website).hostname}
                                            </a>
                                        </div>
                                    </div>
                                )}
                                {place.opening_hours?.weekday_text && (
                                    <div className="flex items-start gap-3">
                                        <Clock className="h-5 w-5 text-gray-400 mt-0.5 shrink-0" />
                                        <div>
                                            <p className="text-sm font-medium mb-1">Opening Hours</p>
                                            <ul className="text-xs text-gray-600 space-y-1">
                                                {place.opening_hours.weekday_text.map((day) => (
                                                    <li key={day}>{day}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <ReservationModal
                            placeId={place.place_id}
                            placeName={place.name}
                            trigger={
                                <Button size="lg" className="w-full font-semibold shadow-lg">
                                    Book a Table
                                </Button>
                            }
                        />
                    </div>

                    {/* Main Info */}
                    <div className="md:col-span-2 space-y-6">
                        {/* Reviews */}
                        <div className="space-y-4">
                            <h2 className="text-xl font-semibold">Reviews</h2>
                            {place.reviews && place.reviews.length > 0 ? (
                                place.reviews.map((review, i) => (
                                    <Card key={i} className="border-none shadow-sm bg-white">
                                        <CardContent className="p-4">
                                            <div className="flex items-center gap-2 mb-2">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={review.profile_photo_url} alt={review.author_name} className="w-8 h-8 rounded-full" />
                                                <div>
                                                    <p className="text-sm font-medium">{review.author_name}</p>
                                                    <div className="flex items-center text-xs text-yellow-500">
                                                        {Array.from({ length: 5 }).map((_, j) => (
                                                            <Star key={j} className={`h-3 w-3 ${j < review.rating ? "fill-current" : "text-gray-300 fill-none"}`} />
                                                        ))}
                                                        <span className="text-gray-400 ml-2">{review.relative_time_description}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <p className="text-sm text-gray-700 leading-relaxed">{review.text}</p>
                                        </CardContent>
                                    </Card>
                                ))
                            ) : (
                                <p className="text-muted-foreground">No reviews available.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
