"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Utensils, LayoutDashboard, User, Search, LogOut, ChevronRight, Menu, X, Calendar, Globe } from "lucide-react";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import toast from "react-hot-toast";
import { useI18n } from "@/components/i18n-provider";

export default function Navbar() {
    const pathname = usePathname();
    const { locale, setLocale } = useI18n();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

    const closeMobileMenu = () => setMobileMenuOpen(false);

    return (
        <header className="px-4 md:px-6 h-14 flex items-center justify-between border-b sticky top-0 bg-white/80 backdrop-blur-xl z-50">
            {/* Logo + Desktop Nav */}
            <div className="flex items-center gap-4 md:gap-6">
                <Link href={homePath} className="flex items-center gap-2">
                    <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center shadow-md shadow-primary/20">
                        <Utensils className="h-4 w-4 text-white" />
                    </div>
                    <span className="font-bold text-lg md:text-xl tracking-tight text-gray-900 hidden sm:inline">
                        NearSpotty
                        {isBusinessPage && <span className="text-primary ml-1 text-sm">Business</span>}
                    </span>
                </Link>

                {/* App Switcher - Only show when NOT signed in */}
                {!user && (
                    <nav className="hidden md:flex items-center gap-1 bg-gray-100 p-0.5 rounded-full">
                        <Link href="/">
                            <Button
                                variant={!isBusinessPage ? "default" : "ghost"}
                                size="sm"
                                className={`rounded-full px-3 h-6 font-bold text-[10px] uppercase tracking-widest ${!isBusinessPage ? "shadow-sm" : "text-gray-500 hover:text-primary"}`}
                            >
                                Diner
                            </Button>
                        </Link>
                        <Link href="/for-restaurants">
                            <Button
                                variant={isBusinessPage ? "default" : "ghost"}
                                size="sm"
                                className={`rounded-full px-3 h-6 font-bold text-[10px] uppercase tracking-widest ${isBusinessPage ? "shadow-sm" : "text-gray-500 hover:text-primary"}`}
                            >
                                Business
                            </Button>
                        </Link>
                    </nav>
                )}

                {/* Find Food Link - Always visible for diners */}
                {(!user || userRole === 'diner') && (
                    <Link href="/search" className="hidden md:flex text-xs font-bold text-gray-600 hover:text-primary transition-colors items-center gap-1">
                        <Search className="h-3.5 w-3.5" />
                        Find Food
                    </Link>
                )}

                {/* Dashboard link for owners */}
                {user && userRole === 'owner' && (
                    <Link href="/dashboard" className="hidden md:flex text-xs font-bold text-gray-600 hover:text-primary transition-colors items-center gap-1">
                        <LayoutDashboard className="h-3.5 w-3.5" />
                        Dashboard
                    </Link>
                )}
            </div>

            {/* Right side - Desktop */}
            <div className="hidden md:flex items-center gap-2">
                {user ? (
                    <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end mr-1">
                            <span className="text-sm font-semibold text-gray-800 leading-none">
                                {user.displayName || user.email?.split('@')[0] || "User"}
                            </span>
                            {subscriptionTier === 'premium' ? (
                                <span className="text-[10px] bg-gradient-to-r from-amber-400 to-yellow-500 text-white px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shadow-sm mt-0.5">
                                    Premium
                                </span>
                            ) : (
                                <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider mt-0.5">
                                    Free
                                </span>
                            )}
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-9 w-9 p-0 rounded-full border border-gray-200 hover:bg-gray-50 overflow-hidden"
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        >
                            {user.photoURL ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={user.photoURL} alt="Profile" className="h-full w-full object-cover" />
                            ) : (
                                <div className="h-full w-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                                    {user.email?.[0]?.toUpperCase() || "U"}
                                </div>
                            )}
                        </Button>
                    </div>
                ) : (
                    /* Not signed in: Login/Signup + Language */
                    <>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setLocale(locale === "en" ? "sk" : "en")}
                            className="font-bold text-[10px] w-6 h-6 p-0 rounded-full border border-gray-100 hover:bg-gray-50"
                        >
                            {locale === "en" ? "SK" : "EN"}
                        </Button>
                        <Link href={`/login${isBusinessPage ? '?role=owner' : ''}`}>
                            <Button variant="ghost" size="sm" className="font-bold text-gray-700 h-7 text-xs">Log in</Button>
                        </Link>
                        <Link href={`/signup${isBusinessPage ? '?role=owner' : ''}`}>
                            <Button size="sm" className="font-bold shadow-md shadow-primary/20 rounded-full px-3 h-7 text-xs flex items-center gap-1">
                                Join
                                <ChevronRight className="h-3 w-3" />
                            </Button>
                        </Link>
                    </>
                )}
            </div>

            {/* Mobile Menu Button */}
            <Button
                variant="ghost"
                size="icon"
                className="md:hidden h-8 w-8"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>

            {/* Dropdown Menu (Desktop for signed-in users + Mobile for everyone) */}
            {mobileMenuOpen && (
                <div className="absolute top-12 right-0 md:right-4 w-full md:w-56 bg-white border-b md:border md:rounded-lg shadow-lg z-50 p-3 animate-in slide-in-from-top-2">
                    <nav className="flex flex-col gap-1">
                        {user ? (
                            /* Signed in menu */
                            <>
                                {/* Quick Actions */}
                                {userRole === 'diner' && (
                                    <>
                                        <Link href="/search" onClick={closeMobileMenu} className="flex items-center gap-3 p-2.5 hover:bg-gray-50 rounded-lg">
                                            <Search className="h-4 w-4 text-gray-500" />
                                            <span className="font-medium text-sm">Find Food</span>
                                        </Link>
                                        <hr className="my-1" />
                                    </>
                                )}

                                {userRole === 'owner' && (
                                    <>
                                        <Link href="/dashboard" onClick={closeMobileMenu} className="flex items-center gap-3 p-2.5 hover:bg-gray-50 rounded-lg">
                                            <LayoutDashboard className="h-4 w-4 text-gray-500" />
                                            <span className="font-medium text-sm">Dashboard</span>
                                        </Link>
                                        <hr className="my-1" />
                                    </>
                                )}

                                {/* Profile & Settings */}
                                <Link href="/profile" onClick={closeMobileMenu} className="flex items-center gap-3 p-2.5 hover:bg-gray-50 rounded-lg">
                                    <User className="h-4 w-4 text-gray-500" />
                                    <span className="font-medium text-sm">Profile</span>
                                </Link>

                                {userRole === 'diner' && (
                                    <Link href="/reservations" onClick={closeMobileMenu} className="flex items-center gap-3 p-2.5 hover:bg-gray-50 rounded-lg">
                                        <Calendar className="h-4 w-4 text-gray-500" />
                                        <span className="font-medium text-sm">Reservations</span>
                                    </Link>
                                )}

                                <button
                                    onClick={() => { setLocale(locale === "en" ? "sk" : "en"); closeMobileMenu(); }}
                                    className="flex items-center gap-3 p-2.5 hover:bg-gray-50 rounded-lg w-full text-left"
                                >
                                    <Globe className="h-4 w-4 text-gray-500" />
                                    <span className="font-medium text-sm">{locale === "en" ? "Slovenčina" : "English"}</span>
                                </button>

                                <hr className="my-1" />

                                <button
                                    onClick={() => { handleLogout(); closeMobileMenu(); }}
                                    className="flex items-center gap-3 p-2.5 hover:bg-red-50 rounded-lg text-red-600 w-full text-left"
                                >
                                    <LogOut className="h-4 w-4" />
                                    <span className="font-medium text-sm">Logout</span>
                                </button>
                            </>
                        ) : (
                            /* Not signed in menu (mobile only) */
                            <>
                                <div className="flex gap-2 mb-2">
                                    <Link href="/" onClick={closeMobileMenu} className="flex-1">
                                        <Button variant={!isBusinessPage ? "default" : "outline"} size="sm" className="w-full font-bold text-xs h-8">
                                            Diner
                                        </Button>
                                    </Link>
                                    <Link href="/for-restaurants" onClick={closeMobileMenu} className="flex-1">
                                        <Button variant={isBusinessPage ? "default" : "outline"} size="sm" className="w-full font-bold text-xs h-8">
                                            Business
                                        </Button>
                                    </Link>
                                </div>

                                <hr className="my-2" />

                                <Link href="/search" onClick={closeMobileMenu} className="flex items-center gap-3 p-2.5 hover:bg-gray-50 rounded-lg">
                                    <Search className="h-4 w-4 text-gray-500" />
                                    <span className="font-medium text-sm">Find Food</span>
                                </Link>

                                <hr className="my-2" />

                                <div className="flex gap-2">
                                    <Link href={`/login${isBusinessPage ? '?role=owner' : ''}`} onClick={closeMobileMenu} className="flex-1">
                                        <Button variant="outline" size="sm" className="w-full h-8">Log in</Button>
                                    </Link>
                                    <Link href={`/signup${isBusinessPage ? '?role=owner' : ''}`} onClick={closeMobileMenu} className="flex-1">
                                        <Button size="sm" className="w-full h-8">Join</Button>
                                    </Link>
                                </div>

                                <button
                                    onClick={() => { setLocale(locale === "en" ? "sk" : "en"); closeMobileMenu(); }}
                                    className="flex items-center gap-3 p-2.5 hover:bg-gray-50 rounded-lg w-full text-left mt-2"
                                >
                                    <Globe className="h-4 w-4 text-gray-500" />
                                    <span className="font-medium text-sm">{locale === "en" ? "Slovenčina" : "English"}</span>
                                </button>
                            </>
                        )}
                    </nav>
                </div>
            )}
        </header>
    );
}
