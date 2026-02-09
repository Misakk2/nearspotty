"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Place } from "@/types/place";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { UserPreferences, GeminiScore } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Star, MapPin, Phone, Globe, Clock, ArrowLeft, Sparkles, CheckCircle2, XCircle, Utensils, CalendarDays, Share2, Info, Image as ImageIcon } from "lucide-react";
import { ReservationModal } from "@/components/reservation/reservation-modal";
import { MatchScoreBadge } from "@/components/search/MatchScoreBadge";
import PlaceLightbox from "@/components/search/PlaceLightbox";

interface PlaceDetailsClientProps {
    place: Place;
}

export default function PlaceDetailsClient({ place }: PlaceDetailsClientProps) {
    const router = useRouter();
    const { user } = useAuth();

    // UI State
    const [activeTab, setActiveTab] = useState<'overview' | 'menu' | 'photos' | 'reviews'>('overview');
    const [isReservationOpen, setIsReservationOpen] = useState(false);
    const [lightboxController, setLightboxController] = useState(false);
    const [lightboxSlide, setLightboxSlide] = useState(1);

    // AI & Preferences
    const [preferences, setPreferences] = useState<UserPreferences | null>(null);
    const [aiScore, setAiScore] = useState<GeminiScore | null>(null);
    const [analyzing, setAnalyzing] = useState(false);

    // Fetch User Preferences (Client-side because it depends on Auth context)
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

    // AI Analysis Trigger
    useEffect(() => {
        if (place && preferences && !aiScore && !analyzing) {
            const analyze = async () => {
                setAnalyzing(true);
                try {
                    const token = await user?.getIdToken();
                    const res = await fetch("/api/gemini/score", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            placeId: place.place_id,
                            name: place.name,
                            dietary: preferences,
                            reviews: place.reviews // Pass reviews for better context
                        })
                    });
                    const data = await res.json();
                    if (res.ok) {
                        setAiScore(data);
                    }
                } catch (error) {
                    console.error("Auto analysis failed", error);
                } finally {
                    setAnalyzing(false);
                }
            };
            analyze();
        }
    }, [place, preferences, aiScore, analyzing, user]);


    const mainPhoto = place.proxyPhotoUrl; // Use new standardized field
    const additionalPhotos = place.photos?.slice(1) || [];

    return (
        <div className="min-h-screen bg-gray-50 pb-24 md:pb-0">
            {/* Header / Hero */}
            <header className="relative h-[33vh] w-full bg-gray-900 overflow-hidden">
                {mainPhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={mainPhoto}
                        alt={place.name}
                        className="w-full h-full object-cover opacity-80"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-800 text-gray-500">
                        <ImageIcon className="h-16 w-16" />
                    </div>
                )}

                <div className="absolute top-4 left-4 z-10">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="bg-primary text-primary-foreground hover:bg-primary/90 backdrop-blur-md shadow-sm"
                        onClick={() => router.back()}
                    >
                        <ArrowLeft className="h-4 w-4 mr-2" /> Back
                    </Button>
                </div>

                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-6 md:p-10 pt-20">
                    <div className="container mx-auto max-w-5xl">
                        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                            <div>
                                <h1 className="text-3xl md:text-5xl font-bold text-white mb-2">{place.name}</h1>
                                <div className="flex flex-wrap items-center gap-3 text-white/90 text-sm md:text-base">
                                    {place.rating && (
                                        <div className="flex items-center gap-1 bg-white/20 px-2 py-0.5 rounded backdrop-blur-sm">
                                            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                                            <span className="font-semibold">{place.rating}</span>
                                            <span className="text-white/60">({place.user_ratings_total})</span>
                                        </div>
                                    )}
                                    {place.price_level !== undefined && (
                                        <div className="flex items-center bg-white/20 px-2 py-0.5 rounded backdrop-blur-sm text-green-300 font-medium">
                                            {Array(place.price_level).fill("€").join("")}
                                        </div>
                                    )}
                                    <div className="flex items-center gap-1">
                                        <MapPin className="h-4 w-4 text-white/70" />
                                        <span className="truncate max-w-[200px] md:max-w-none">{place.formatted_address}</span>
                                    </div>
                                    {place.isClaimed && (
                                        <div className="flex items-center gap-1 bg-primary/90 px-2 py-0.5 rounded backdrop-blur-sm text-primary-foreground text-xs font-semibold">
                                            <CheckCircle2 className="h-3 w-3" />
                                            Verified
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* AI Score Badge in Header */}
                            {aiScore && (
                                <div className="shrink-0 animate-in fade-in slide-in-from-bottom-4 duration-700">
                                    <MatchScoreBadge score={aiScore.matchScore} size="lg" />
                                    <p className="text-center text-xs text-green-200 mt-1 font-medium">AI Match Score</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            <main className="container mx-auto max-w-5xl px-4 py-6 md:py-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

                    {/* LEFT COLUMN: Main Content */}
                    <div className="md:col-span-2 space-y-8">
                        {/* Tab Navigation */}
                        <div className="flex items-center gap-4 border-b overflow-x-auto pb-1 no-scrollbar">
                            <button
                                onClick={() => setActiveTab('overview')}
                                className={`pb-3 px-2 text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'overview' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-gray-900'}`}
                            >
                                Overview
                            </button>
                            <button
                                onClick={() => setActiveTab('menu')}
                                className={`pb-3 px-2 text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'menu' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-gray-900'}`}
                            >
                                Menu & Dining
                            </button>
                            <button
                                onClick={() => setActiveTab('photos')}
                                className={`pb-3 px-2 text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'photos' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-gray-900'}`}
                            >
                                Photos {additionalPhotos.length > 0 && `(${additionalPhotos.length})`}
                            </button>
                            <button
                                onClick={() => setActiveTab('reviews')}
                                className={`pb-3 px-2 text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'reviews' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-gray-900'}`}
                            >
                                Reviews
                            </button>
                        </div>

                        {/* TAB CONTENT: OVERVIEW */}
                        {activeTab === 'overview' && (
                            <div className="space-y-6">
                                {/* Only For You Section (AI) */}
                                {activeTab === 'overview' && (aiScore || analyzing) && (
                                    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-6 border border-indigo-100/50 shadow-sm relative overflow-hidden">
                                        <div className="absolute top-0 right-0 p-4 opacity-10">
                                            <Sparkles className="h-24 w-24 text-indigo-500" />
                                        </div>

                                        <div className="relative z-10">
                                            <div className="flex items-center gap-2 mb-4">
                                                <div className="bg-indigo-600 text-white p-1.5 rounded-lg shadow-sm">
                                                    <Sparkles className="h-4 w-4" />
                                                </div>
                                                <h2 className="text-lg font-bold text-gray-900">Why for {preferences?.dietary?.[0] || "you"}?</h2>
                                            </div>

                                            {analyzing ? (
                                                <div className="flex items-center gap-3 text-indigo-700">
                                                    <Loader2 className="h-5 w-5 animate-spin" />
                                                    <span className="font-medium animate-pulse">Analyzing based on your taste profile...</span>
                                                </div>
                                            ) : aiScore ? (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <div className="space-y-3">
                                                        <h3 className="text-sm font-semibold text-green-700 flex items-center gap-1.5 uppercase tracking-wide">
                                                            <CheckCircle2 className="h-4 w-4" /> Perfect For You
                                                        </h3>
                                                        <ul className="space-y-2">
                                                            {aiScore.pros?.map((pro, i) => (
                                                                <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                                                                    <span className="block w-1.5 h-1.5 rounded-full bg-green-400 mt-1.5 shrink-0" />
                                                                    {pro}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                    {aiScore.cons && aiScore.cons.length > 0 && (
                                                        <div className="space-y-3">
                                                            <h3 className="text-sm font-semibold text-rose-700 flex items-center gap-1.5 uppercase tracking-wide">
                                                                <XCircle className="h-4 w-4" /> Keep in mind
                                                            </h3>
                                                            <ul className="space-y-2">
                                                                {aiScore.cons.map((con, i) => (
                                                                    <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                                                                        <span className="block w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />
                                                                        {con}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                )}

                                {/* Basic Info Grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {place.opening_hours?.open_now !== undefined && (
                                        <Card className="shadow-sm border-gray-100 bg-white">
                                            <CardContent className="p-4 flex items-center gap-3">
                                                <div className={`p-2 rounded-full ${place.opening_hours.open_now ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                    <Clock className="h-5 w-5" />
                                                </div>
                                                <div>
                                                    <p className={`font-semibold ${place.opening_hours.open_now ? 'text-green-700' : 'text-red-700'}`}>
                                                        {place.opening_hours.open_now ? 'Open Now' : 'Closed'}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">Check schedule in map</p>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )}

                                    {place.website && (
                                        <Card className="shadow-sm border-gray-100 bg-white group cursor-pointer hover:border-primary/20 transition-colors" onClick={() => window.open(place.website, '_blank')}>
                                            <CardContent className="p-4 flex items-center gap-3">
                                                <div className="p-2 rounded-full bg-blue-50 text-blue-600 group-hover:bg-blue-100 transition-colors">
                                                    <Globe className="h-5 w-5" />
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-gray-900 group-hover:text-primary transition-colors">Visit Website</p>
                                                    <p className="text-xs text-muted-foreground truncate max-w-[150px]">{place.website.replace(/^https?:\/\//, '')}</p>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )}
                                </div>

                                {/* About Section */}
                                <div className="prose prose-sm max-w-none text-gray-600">
                                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                        <Info className="h-5 w-5 text-gray-400" />
                                        About {place.name}
                                    </h3>
                                    <p>
                                        {aiScore?.shortReason || place.description || "A popular spot in town."}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* TAB CONTENT: MENU */}
                        {activeTab === 'menu' && (
                            <div className="space-y-6">
                                <div className="text-center py-10 bg-white border rounded-xl border-dashed">
                                    <Utensils className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                                    <h3 className="text-lg font-medium">Menu</h3>
                                    {place.website ? (
                                        <div className="mt-4">
                                            <Button variant="outline" onClick={() => window.open(place.website, '_blank')}>
                                                Verify Menu on Website
                                            </Button>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground mt-2">No online menu detected. Try calling the venue.</p>
                                    )}
                                </div>

                                {aiScore?.recommendedDish && (
                                    <div className="bg-orange-50 p-4 rounded-lg border border-orange-100">
                                        <h4 className="font-semibold text-orange-800 mb-2 flex items-center gap-2">
                                            <Star className="h-4 w-4 fill-orange-500 text-orange-500" />
                                            AI Selection
                                        </h4>
                                        <p className="text-sm text-gray-700">
                                            Based on reviews, people love the <span className="font-bold text-gray-900">&quot;{aiScore.recommendedDish}&quot;</span> here!
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {additionalPhotos.length > 0 ? additionalPhotos.map((photo, i) => (
                                <div
                                    key={i}
                                    className="aspect-square bg-gray-100 rounded-lg overflow-hidden relative group cursor-pointer"
                                    onClick={() => {
                                        setLightboxSlide(i + 1);
                                        setLightboxController(!lightboxController);
                                    }}
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={photo.proxyPhotoUrl || ""}
                                        alt={`Photo ${i}`}
                                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                    />
                                </div>
                            )) : (
                                <p className="col-span-full text-center py-10 text-muted-foreground">No additional photos available.</p>
                            )}
                        </div>
                        <PlaceLightbox
                            isOpen={lightboxController}
                            initialIndex={lightboxSlide - 1} // 0-based index for logic, component handles slide mapping
                            images={additionalPhotos.map(p => p.proxyPhotoUrl || "")}
                        />

                        {/* TAB CONTENT: REVIEWS */}
                        {activeTab === 'reviews' && (
                            <div className="space-y-4">
                                {place.reviews?.map((review, i) => (
                                    <Card key={i} className="bg-white hover:bg-gray-50/50 transition-colors">
                                        <CardContent className="p-4">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="flex text-amber-400">
                                                    {Array(5).fill(0).map((_, starI) => (
                                                        <Star key={starI} className={`h-3 w-3 ${starI < review.rating ? 'fill-current' : 'text-gray-300'}`} />
                                                    ))}
                                                </div>
                                                <span className="text-xs font-semibold text-gray-900">{review.author_name}</span>
                                                <span className="text-xs text-muted-foreground ml-auto">{review.relative_time_description}</span>
                                            </div>
                                            <p className="text-sm text-gray-600 leading-relaxed italic">&quot;{review.text}&quot;</p>
                                        </CardContent>
                                    </Card>
                                )) || (
                                        <p className="text-center py-10 text-muted-foreground">No reviews available via API.</p>
                                    )}
                            </div>
                        )}

                    </div>

                    {/* RIGHT COLUMN: Sticky Booking / Quick Info */}
                    <div className="md:col-span-1">
                        <div className="sticky top-24 space-y-4">
                            {/* Booking Card - Conditional */}
                            {place.isClaimed && (
                                <Card className="border-2 border-primary/10 shadow-lg overflow-hidden">
                                    <div className="bg-primary/5 p-3 text-center border-b border-primary/10">
                                        <p className="text-sm font-semibold text-primary">NearSpotty Member Perk</p>
                                    </div>
                                    <CardContent className="p-6 space-y-4">
                                        <div className="text-center">
                                            <p className="text-gray-500 text-sm mb-1">Make a reservation</p>
                                            <p className="text-lg font-bold text-gray-900">Reserve a Table</p>
                                        </div>

                                        <Button size="lg" className="w-full font-bold shadow-md hover:shadow-lg transition-all" onClick={() => setIsReservationOpen(true)}>
                                            <CalendarDays className="h-4 w-4 mr-2" />
                                            Request Booking
                                        </Button>

                                        <p className="text-xs text-center text-muted-foreground mt-2">
                                            Free for NearSpotty users. Instant confirmation via SMS.
                                        </p>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Location Card */}
                            <Card>
                                <CardContent className="p-4">
                                    <h4 className="font-semibold text-sm mb-3">Getting There</h4>
                                    {place.formatted_address && (
                                        <div className="flex gap-2 text-sm text-gray-600 mb-4">
                                            <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                                            {place.formatted_address}
                                        </div>
                                    )}
                                    {place.formatted_phone_number && (
                                        <div className="flex gap-2 text-sm text-gray-600">
                                            <Phone className="h-4 w-4 shrink-0 mt-0.5" />
                                            {place.formatted_phone_number}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>

                {/* Mobile Fixed CTA - Conditional */}
                {place.isClaimed && (
                    <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur border-t md:hidden z-50 flex items-center gap-3 shadow-[0_-5px_15px_-5px_rgba(0,0,0,0.1)]">
                        <Button variant="outline" size="icon" className="shrink-0">
                            <Share2 className="h-4 w-4" />
                        </Button>
                        <Button className="w-full font-bold shadow-md" onClick={() => setIsReservationOpen(true)}>
                            Book Table
                        </Button>
                    </div>
                )}

                <ReservationModal
                    isOpen={isReservationOpen}
                    onClose={() => setIsReservationOpen(false)}
                    placeName={place.name}
                />
            </main>
        </div>
    );
}
