"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Search, Loader2, MapPin, ChevronUp, User, LogOut, CreditCard, Settings, X } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import toast from "react-hot-toast";
import { Place } from "@/types/place";
import { GeminiScore, UserPreferences } from "@/types";
import PlaceCard from "@/components/search/place-card";
import { APP_CATEGORIES } from "@/config/categories";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

interface MobileSearchProps {
    places: Place[];
    loading: boolean;
    scoringLoading: boolean;
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    onSearch: (e: React.FormEvent) => void;
    onCategorySelect: (cat: string) => void;
    selectedCategory: string | null;
    scores: Record<string, GeminiScore>;
    preferences: UserPreferences | null;
    limitReached: boolean;
    remainingScans: number;
    subscriptionTier: 'free' | 'premium';
    onUseLocation: () => void;
    onPlaceSelect: (id: string) => void;
    userLocation?: { lat: number; lng: number } | null;
    onClear: () => void;
}

const LOADING_MESSAGES = [
    "Asking the chef...",
    "Checking the pantry...",
    "Smelling the spices...",
    "Taste testing nearby...",
    "Consulting the food critics...",
    "Finding the secret spots...",
    "Reading the menu..."
];

export default function MobileSearch({
    places,
    loading,
    scoringLoading,
    searchQuery,
    setSearchQuery,
    onSearch,
    onCategorySelect,
    selectedCategory,
    scores,
    preferences,
    limitReached,
    remainingScans,
    subscriptionTier,
    onUseLocation,
    onPlaceSelect,
    userLocation,
    onClear
}: MobileSearchProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState(LOADING_MESSAGES[0]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const { user, subscriptionTier: userTier } = useAuth();

    const handleLogout = async () => {
        try {
            await signOut(auth);
            toast.success("Logged out");
            window.location.reload();
        } catch (error) {
            toast.error("Logout failed");
        }
    };

    // Cycle loading messages
    useEffect(() => {
        if (loading || scoringLoading) {
            setIsExpanded(true); // Auto expand on load
            const interval = setInterval(() => {
                setLoadingMessage(LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)]);
            }, 2000);
            return () => clearInterval(interval);
        }
    }, [loading, scoringLoading]);

    // Auto-expand if we have results
    useEffect(() => {
        if (places.length > 0) {
            setIsExpanded(true);
        }
    }, [places]);

    const handleExpandToggle = () => setIsExpanded(!isExpanded);

    return (
        <div className="md:hidden fixed inset-x-0 bottom-0 z-50 pointer-events-none">
            {/* The Main Results Sheet Container */}
            <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                className="bg-white rounded-t-3xl shadow-[0_-4px_30px_rgba(0,0,0,0.15)] pointer-events-auto flex flex-col max-h-[85vh]"
            >
                {/* Drag Handle / Header */}
                <div
                    className="w-full flex justify-center pt-3 pb-2 cursor-pointer bg-white rounded-t-3xl border-b border-gray-100/50"
                    onClick={handleExpandToggle}
                >
                    <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
                </div>

                {/* Content Area (Scrollable Results) */}
                <AnimatePresence>
                    {isExpanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-y-auto bg-gray-50/50"
                            style={{ maxHeight: "60vh" }}
                            ref={scrollRef}
                        >
                            <div className="p-4 space-y-4 min-h-[200px]">
                                {/* Limit Badge */}
                                <div className="flex items-center justify-between px-1">
                                    <span className="text-xs font-semibold text-gray-500">{places.length} places found</span>
                                    {subscriptionTier === 'free' && (
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${remainingScans > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                            {remainingScans} AI Scans Left
                                        </span>
                                    )}
                                </div>

                                {/* Loading State */}
                                {(loading || scoringLoading) && (
                                    <div className="flex flex-col items-center justify-center py-8 space-y-4 animate-in fade-in">
                                        <div className="relative">
                                            <div className="h-16 w-16 rounded-full border-4 border-gray-100 border-t-primary animate-spin"></div>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <UtensilsIcon className="h-6 w-6 text-primary animate-pulse" />
                                            </div>
                                        </div>
                                        <p className="text-sm font-medium text-gray-600 animate-pulse">{loadingMessage}</p>
                                    </div>
                                )}

                                {/* Results List */}
                                {!loading && places.map((place) => (
                                    <div key={place.place_id} onClick={() => {
                                        if (place.geometry && place.geometry.location) {
                                            onPlaceSelect(place.place_id);
                                        }
                                    }}>
                                        <PlaceCard
                                            place={place}
                                            preferences={preferences}
                                            score={scores[place.place_id]}
                                            scoringLoading={scoringLoading}
                                            limitReached={limitReached}
                                            isMobile={true}
                                            userLocation={userLocation ?? undefined}
                                        />
                                    </div>
                                ))}

                                {/* Empty State */}
                                {!loading && places.length === 0 && (
                                    <div className="text-center py-8 text-gray-500">
                                        <p>No places found. Try a different category!</p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Categories & Search Bar (Always Visible) */}
                <div className="bg-white p-4 space-y-3 pb-safe-area shadow-[0_-1px_10px_rgba(0,0,0,0.05)]">
                    {/* Categories - Horizontal Scroll */}
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4 scroll-smooth">
                        {/* Use Location Button as first chip */}
                        <button
                            onClick={onUseLocation}
                            className="flex items-center gap-1 bg-primary/10 text-primary px-3 py-2 rounded-full whitespace-nowrap text-xs font-bold hover:bg-primary/20 transition-colors shrink-0"
                        >
                            <MapPin className="h-3 w-3" />
                            Near Me
                        </button>

                        {APP_CATEGORIES.map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => onCategorySelect(cat.id)}
                                className={`px-4 py-2 rounded-full whitespace-nowrap text-xs font-bold transition-all shrink-0 border ${selectedCategory === cat.id
                                    ? 'bg-gray-900 text-white border-gray-900 shadow-md transform scale-105'
                                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                                    }`}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>

                    {/* Search Input & Profile Button Row */}
                    <div className="flex items-center gap-3">
                        {/* Profile Button */}
                        <button
                            onClick={() => setIsProfileOpen(true)}
                            className="h-12 w-12 rounded-2xl bg-gray-50 flex items-center justify-center shrink-0 border border-gray-100 active:scale-95 transition-transform"
                        >
                            {user?.photoURL ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={user.photoURL} alt="Me" className="h-full w-full object-cover rounded-2xl" />
                            ) : (
                                <User className="h-5 w-5 text-gray-600" />
                            )}
                        </button>

                        {/* Search Bar */}
                        <form onSubmit={onSearch} className="relative flex-1 flex items-center">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="What are you craving?"
                                className="w-full h-12 pl-11 pr-12 rounded-2xl bg-gray-100 border-none focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all text-sm font-medium"
                                onFocus={() => setIsExpanded(true)}
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSearchQuery("");
                                        onClear();
                                    }}
                                    className="absolute right-12 top-1/2 -translate-y-1/2 p-1.5 rounded-full hover:bg-gray-200 text-gray-500 transition-colors"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                            <Button
                                type="submit"
                                size="icon"
                                className="absolute right-1 top-1 h-10 w-10 rounded-xl bg-white shadow-sm hover:bg-gray-50 text-gray-900 border border-gray-100"
                            >
                                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronUp className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />}
                            </Button>
                        </form>
                    </div>
                </div>
            </motion.div>

            {/* Profile Sheet Overlay - Outside the main motion.div but inside pointer-events-none parent... Wait */}
            {/* If parent is pointer-events-none, we need pointer-events-auto on this child too */}
            <AnimatePresence>
                {isProfileOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm pointer-events-auto"
                            onClick={() => setIsProfileOpen(false)}
                        />
                        <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-[70] p-6 pb-safe-area shadow-2xl pointer-events-auto"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    {user?.photoURL ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={user.photoURL} alt="Profile" className="h-12 w-12 rounded-full object-cover border-2 border-primary/20" />
                                    ) : (
                                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                                            {user?.email?.[0]?.toUpperCase() || "U"}
                                        </div>
                                    )}
                                    <div>
                                        <p className="font-bold text-lg text-gray-900">{user?.displayName || "User"}</p>
                                        <p className="text-sm text-gray-500">{user?.email}</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => setIsProfileOpen(false)}>
                                    <X className="h-5 w-5 text-gray-400" />
                                </Button>
                            </div>

                            <div className="space-y-2">
                                <Link href="/subscription" onClick={() => setIsProfileOpen(false)}>
                                    <Button variant="outline" className="w-full justify-start gap-3 h-12 text-base font-medium rounded-xl border-gray-200">
                                        <CreditCard className="h-5 w-5 text-purple-500" />
                                        Manage Subscription
                                        {subscriptionTier === 'premium' && <span className="ml-auto text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">PRO</span>}
                                    </Button>
                                </Link>

                                <Link href="/profile" onClick={() => setIsProfileOpen(false)}>
                                    <Button variant="outline" className="w-full justify-start gap-3 h-12 text-base font-medium rounded-xl border-gray-200">
                                        <Settings className="h-5 w-5 text-gray-500" />
                                        Preferences
                                    </Button>
                                </Link>

                                <div className="h-px bg-gray-100 my-4" />

                                <Button
                                    variant="ghost"
                                    className="w-full justify-start gap-3 h-12 text-base font-medium text-red-600 hover:bg-red-50 hover:text-red-700 rounded-xl"
                                    onClick={handleLogout}
                                >
                                    <LogOut className="h-5 w-5" />
                                    Log Out
                                </Button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}

function UtensilsIcon({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
            <path d="M7 2v20" />
            <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
        </svg>
    )
}
