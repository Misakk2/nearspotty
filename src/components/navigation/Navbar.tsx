"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Utensils, LayoutDashboard, User, Search, LogOut, ChevronRight, Menu, X } from "lucide-react";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import toast from "react-hot-toast";
import { useI18n } from "@/components/i18n-provider";

export default function Navbar() {
    const pathname = usePathname();
    const { user, userRole } = useAuth();
    const { locale, setLocale } = useI18n();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

                {/* Desktop App Switcher - Hidden on Mobile */}
                <nav className="hidden lg:flex items-center gap-1 bg-gray-100 p-0.5 rounded-full">
                    <Link href={homePath}>
                        <Button
                            variant={!isBusinessPage ? "default" : "ghost"}
                            size="sm"
                            className={`rounded-full px-4 h-7 font-bold text-[10px] uppercase tracking-widest ${!isBusinessPage ? "shadow-sm" : "text-gray-500 hover:text-primary"}`}
                        >
                            Diner
                        </Button>
                    </Link>
                    <Link href="/for-restaurants">
                        <Button
                            variant={isBusinessPage ? "default" : "ghost"}
                            size="sm"
                            className={`rounded-full px-4 h-7 font-bold text-[10px] uppercase tracking-widest ${isBusinessPage ? "shadow-sm" : "text-gray-500 hover:text-primary"}`}
                        >
                            Business
                        </Button>
                    </Link>
                </nav>

                {/* Desktop Quick Links */}
                <div className="hidden md:flex items-center gap-4">
                    {!isBusinessPage ? (
                        <Link href="/search" className="text-xs font-bold text-gray-600 hover:text-primary transition-colors flex items-center gap-1.5">
                            <Search className="h-3.5 w-3.5" />
                            Find Food
                        </Link>
                    ) : (
                        <>
                            <Link href="/for-restaurants#features" className="text-xs font-bold text-gray-600 hover:text-primary transition-colors">Features</Link>
                            <Link href="/for-restaurants#pricing" className="text-xs font-bold text-gray-600 hover:text-primary transition-colors">Pricing</Link>
                        </>
                    )}
                </div>
            </div>

            {/* Desktop Right Nav */}
            <nav className="hidden md:flex items-center gap-2">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLocale(locale === "en" ? "sk" : "en")}
                    className="font-bold text-[10px] w-7 h-7 p-0 rounded-full border border-gray-100 hover:bg-gray-50"
                    title={locale === "en" ? "Prepnúť do Slovenčiny" : "Switch to English"}
                >
                    {locale === "en" ? "SK" : "EN"}
                </Button>

                {user ? (
                    <div className="flex items-center gap-1.5">
                        {userRole === 'owner' ? (
                            <>
                                <Link href="/dashboard">
                                    <Button variant={pathname.startsWith("/dashboard") ? "default" : "ghost"} size="sm" className="font-bold flex items-center gap-1.5 h-8">
                                        <LayoutDashboard className="h-3.5 w-3.5" />
                                        Dashboard
                                    </Button>
                                </Link>
                                <Link href="/profile">
                                    <Button variant={pathname === "/profile" ? "default" : "ghost"} size="icon" className="rounded-full h-8 w-8">
                                        <User className="h-3.5 w-3.5" />
                                    </Button>
                                </Link>
                            </>
                        ) : userRole === 'diner' ? (
                            <>
                                <Link href="/profile">
                                    <Button variant={pathname === "/profile" ? "default" : "ghost"} size="sm" className="font-bold flex items-center gap-1.5 h-8">
                                        <User className="h-3.5 w-3.5" />
                                        Profile
                                    </Button>
                                </Link>
                                <Link href="/reservations">
                                    <Button variant={pathname === "/reservations" ? "default" : "ghost"} size="icon" className="rounded-full h-8 w-8">
                                        <Utensils className="h-3.5 w-3.5" />
                                    </Button>
                                </Link>
                            </>
                        ) : (
                            <Link href="/onboarding">
                                <Button variant="outline" size="sm" className="border-primary text-primary font-bold hover:bg-primary/5 h-8">
                                    Complete Setup
                                </Button>
                            </Link>
                        )}
                        <Button variant="outline" size="icon" onClick={handleLogout} className="rounded-full h-8 w-8 bg-red-50 hover:bg-red-100 border-red-100 text-red-600">
                            <LogOut className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5">
                        <Link href={`/login${isBusinessPage ? '?role=owner' : ''}`}>
                            <Button variant="ghost" size="sm" className="font-bold text-gray-700 h-8">Log in</Button>
                        </Link>
                        <Link href={`/signup${isBusinessPage ? '?role=owner' : ''}`}>
                            <Button size="sm" className="font-bold shadow-lg shadow-primary/20 rounded-full px-4 h-8 flex items-center gap-1">
                                {isBusinessPage ? 'Join' : 'Join Now'}
                                <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                        </Link>
                    </div>
                )}
            </nav>

            {/* Mobile Menu Button */}
            <Button
                variant="ghost"
                size="icon"
                className="md:hidden h-8 w-8"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
                {mobileMenuOpen ? <X className="h-5102 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>

            {/* Mobile Menu Dropdown */}
            {mobileMenuOpen && (
                <div className="absolute top-14 left-0 right-0 bg-white border-b shadow-lg z-50 p-4 md:hidden animate-in slide-in-from-top-2">
                    <nav className="flex flex-col gap-2">
                        {/* App Switcher */}
                        <div className="flex gap-2 mb-2">
                            <Link href={homePath} onClick={closeMobileMenu} className="flex-1">
                                <Button variant={!isBusinessPage ? "default" : "outline"} size="sm" className="w-full font-bold text-xs">
                                    Diner App
                                </Button>
                            </Link>
                            <Link href="/for-restaurants" onClick={closeMobileMenu} className="flex-1">
                                <Button variant={isBusinessPage ? "default" : "outline"} size="sm" className="w-full font-bold text-xs">
                                    Business
                                </Button>
                            </Link>
                        </div>

                        <hr className="my-2" />

                        {/* Quick Links */}
                        {!isBusinessPage ? (
                            <Link href="/search" onClick={closeMobileMenu} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded-lg">
                                <Search className="h-4 w-4" />
                                <span className="font-medium">Find Food</span>
                            </Link>
                        ) : (
                            <>
                                <Link href="/for-restaurants#features" onClick={closeMobileMenu} className="p-2 hover:bg-gray-50 rounded-lg font-medium">Features</Link>
                                <Link href="/for-restaurants#pricing" onClick={closeMobileMenu} className="p-2 hover:bg-gray-50 rounded-lg font-medium">Pricing</Link>
                            </>
                        )}

                        <hr className="my-2" />

                        {/* Auth Actions */}
                        {user ? (
                            <>
                                {userRole === 'owner' && (
                                    <Link href="/dashboard" onClick={closeMobileMenu} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded-lg">
                                        <LayoutDashboard className="h-4 w-4" />
                                        <span className="font-medium">Dashboard</span>
                                    </Link>
                                )}
                                <Link href="/profile" onClick={closeMobileMenu} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded-lg">
                                    <User className="h-4 w-4" />
                                    <span className="font-medium">Profile</span>
                                </Link>
                                <button onClick={() => { handleLogout(); closeMobileMenu(); }} className="flex items-center gap-2 p-2 hover:bg-red-50 rounded-lg text-red-600 w-full text-left">
                                    <LogOut className="h-4 w-4" />
                                    <span className="font-medium">Logout</span>
                                </button>
                            </>
                        ) : (
                            <div className="flex gap-2">
                                <Link href={`/login${isBusinessPage ? '?role=owner' : ''}`} onClick={closeMobileMenu} className="flex-1">
                                    <Button variant="outline" size="sm" className="w-full">Log in</Button>
                                </Link>
                                <Link href={`/signup${isBusinessPage ? '?role=owner' : ''}`} onClick={closeMobileMenu} className="flex-1">
                                    <Button size="sm" className="w-full">Join Now</Button>
                                </Link>
                            </div>
                        )}

                        {/* Language Toggle */}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setLocale(locale === "en" ? "sk" : "en"); closeMobileMenu(); }}
                            className="justify-start mt-2"
                        >
                            🌐 {locale === "en" ? "Switch to Slovak" : "Switch to English"}
                        </Button>
                    </nav>
                </div>
            )}
        </header>
    );
}
