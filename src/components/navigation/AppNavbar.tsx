"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Utensils, LayoutDashboard, User, Search, LogOut, ChevronRight, Menu, X, Calendar, Globe, MapPin } from "lucide-react";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import toast from "react-hot-toast";
import { useI18n } from "@/components/i18n-provider";

export default function AppNavbar() {
    const pathname = usePathname();
    const { locale, setLocale } = useI18n();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const { user, userRole, subscriptionTier } = useAuth();

    const isBusinessPage = pathname.startsWith("/for-restaurants") || pathname.startsWith("/dashboard");

    const handleLogout = async () => {
        try {
            await signOut(auth);
            toast.success("Logged out successfully");
            window.location.href = "/";
        } catch (error) {
            console.error("Logout error details:", error);
            toast.error("Failed to log out. Please refresh the page.");
        }
    };

    const homePath = user
        ? (userRole === "owner" ? "/dashboard" : "/search")
        : "/";

    return (
        <header className="hidden md:flex px-6 h-16 items-center justify-between border-b sticky top-0 bg-white/80 backdrop-blur-xl z-50">
            {/* 1. Logo */}
            <div className="flex items-center gap-4">
                <Link href={homePath} className="flex items-center gap-2">
                    <div className="h-9 w-9 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 hover:scale-105 transition-transform">
                        <Utensils className="h-5 w-5 text-white" />
                    </div>
                    <span className="font-extrabold text-xl tracking-tight text-gray-900 bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600">
                        NearSpotty
                        {isBusinessPage && <span className="text-primary ml-1 text-xs uppercase tracking-widest font-bold">Business</span>}
                    </span>
                </Link>
            </div>

            {/* 2. Desktop Search Input */}
            <form onSubmit={(e) => {
                e.preventDefault();
                if (searchQuery.trim()) {
                    // Navigate to search page with query parameter
                    window.location.href = `/search?keyword=${encodeURIComponent(searchQuery)}`;
                }
            }} className="flex-1 max-w-xl mx-8 relative group">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-gray-400 group-focus-within:text-primary transition-colors" />
                </div>
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search for restaurants, cuisines..."
                    className="w-full h-10 pl-10 pr-4 rounded-full border border-gray-200 bg-gray-50 focus:bg-white focus:border-primary/50 focus:ring-4 focus:ring-primary/10 outline-none transition-all text-sm font-medium"
                />
            </form>

            <Button
                variant="outline"
                size="sm"
                className="hidden md:flex gap-2 mr-4 rounded-full border-gray-200 hover:border-primary hover:text-primary transition-colors"
                onClick={() => {
                    // Redirect to search with action flag
                    window.location.href = "/search?action=use_location";
                }}
            >
                <MapPin className="h-4 w-4" />
                <span className="hidden lg:inline">Near Me</span>
            </Button>

            {/* 3. Right Side - Profile Dropdown */}
            <div className="flex items-center gap-2">
                {!user ? (
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setLocale(locale === "en" ? "sk" : "en")}
                            className="font-bold text-xs"
                        >
                            {locale === "en" ? "SK" : "EN"}
                        </Button>
                        <Link href="/login">
                            <Button variant="ghost" size="sm" className="font-bold">Log in</Button>
                        </Link>
                        <Link href="/signup">
                            <Button size="sm" className="rounded-full font-bold shadow-lg shadow-primary/25">Join</Button>
                        </Link>
                    </div>
                ) : (
                    <div className="relative">
                        <Button
                            variant="ghost"
                            className="rounded-full h-10 w-10 p-0 border-2 border-transparent hover:border-primary/20 transition-all"
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        >
                            {user.photoURL ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={user.photoURL} alt="Profile" className="h-full w-full object-cover rounded-full" />
                            ) : (
                                <div className="h-full w-full bg-gradient-to-tr from-primary/10 to-primary/5 flex items-center justify-center text-primary font-bold rounded-full">
                                    {user.email?.[0]?.toUpperCase() || "U"}
                                </div>
                            )}
                        </Button>

                        {/* Dropdown Menu */}
                        {mobileMenuOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setMobileMenuOpen(false)}></div>
                                <div className="absolute top-12 right-0 w-64 bg-white border rounded-2xl shadow-2xl z-50 p-2 animate-in slide-in-from-top-2">
                                    <div className="p-3 border-b mb-1">
                                        <p className="font-bold text-gray-900 truncate">{user.displayName || "User"}</p>
                                        <p className="text-xs text-gray-500 truncate">{user.email}</p>
                                        {subscriptionTier === 'premium' ? (
                                            <span className="inline-block mt-2 text-[10px] bg-gradient-to-r from-amber-400 to-yellow-500 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shadow-sm">
                                                Premium Member
                                            </span>
                                        ) : (
                                            <Link href="/subscription" className="inline-block mt-2">
                                                <span className="text-[10px] bg-gray-100 text-gray-600 hover:bg-gray-200 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider cursor-pointer transition-colors">
                                                    Free Plan • Upgrade
                                                </span>
                                            </Link>
                                        )}
                                    </div>

                                    <nav className="flex flex-col gap-0.5">
                                        <Link href="/profile" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 p-2.5 hover:bg-gray-50 rounded-xl transition-colors">
                                            <User className="h-4 w-4 text-gray-500" />
                                            <span className="font-medium text-sm">Profile</span>
                                        </Link>
                                        <Link href="/reservations" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 p-2.5 hover:bg-gray-50 rounded-xl transition-colors">
                                            <Calendar className="h-4 w-4 text-gray-500" />
                                            <span className="font-medium text-sm">Reservations</span>
                                        </Link>
                                        <Link href="/subscription" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 p-2.5 hover:bg-gray-50 rounded-xl transition-colors">
                                            <Utensils className="h-4 w-4 text-gray-500" />
                                            <span className="font-medium text-sm">Membership</span>
                                        </Link>
                                        <button onClick={() => { setLocale(locale === "en" ? "sk" : "en"); }} className="flex items-center gap-3 p-2.5 hover:bg-gray-50 rounded-xl w-full text-left transition-colors">
                                            <Globe className="h-4 w-4 text-gray-500" />
                                            <span className="font-medium text-sm">Language: {locale.toUpperCase()}</span>
                                        </button>
                                        <div className="h-[1px] bg-gray-100 my-1"></div>
                                        <button onClick={handleLogout} className="flex items-center gap-3 p-2.5 hover:bg-red-50 text-red-600 rounded-xl w-full text-left transition-colors">
                                            <LogOut className="h-4 w-4" />
                                            <span className="font-medium text-sm">Log Out</span>
                                        </button>
                                    </nav>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </header>
    );
}
