"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Utensils, LayoutDashboard, User, Search, LogOut, ChevronRight } from "lucide-react";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import toast from "react-hot-toast";

export default function Navbar() {
    const pathname = usePathname();
    const { user, userRole } = useAuth();

    const isBusinessPage = pathname.startsWith("/for-restaurants") || pathname.startsWith("/dashboard");

    const handleLogout = async () => {
        try {
            await signOut(auth);
            toast.success("Logged out successfully");
            window.location.href = "/"; // Force full reload to clear state
        } catch (error) {
            console.error("Logout error details:", error);
            // Even if signout fails (e.g. connectivity), we should clear local state if possible
            // or at least notify the user more clearly
            toast.error("Failed to log out. Please refresh the page.");
        }
    };

    const homePath = user
        ? (userRole === "owner" ? "/dashboard" : "/search")
        : "/";

    return (
        <header className="px-6 h-20 flex items-center justify-between border-b sticky top-0 bg-white/80 backdrop-blur-xl z-50">
            <div className="flex items-center gap-8">
                <Link href={homePath} className="flex items-center gap-2">
                    <div className="h-10 w-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                        <Utensils className="h-6 w-6 text-white" />
                    </div>
                    <span className="font-bold text-2xl tracking-tight text-gray-900">
                        NearSpotty
                        {isBusinessPage && <span className="text-primary ml-1">Business</span>}
                    </span>
                </Link>

                <nav className="hidden lg:flex items-center gap-1 bg-gray-100 p-1 rounded-full">
                    <Link href={homePath}>
                        <Button
                            variant={!isBusinessPage ? "default" : "ghost"}
                            size="sm"
                            className={`rounded-full px-6 font-bold text-xs uppercase tracking-widest ${!isBusinessPage ? "shadow-md" : "text-gray-500 hover:text-primary"}`}
                        >
                            Diner App
                        </Button>
                    </Link>
                    <Link href="/for-restaurants">
                        <Button
                            variant={isBusinessPage ? "default" : "ghost"}
                            size="sm"
                            className={`rounded-full px-6 font-bold text-xs uppercase tracking-widest ${isBusinessPage ? "shadow-md" : "text-gray-500 hover:text-primary"}`}
                        >
                            For Business
                        </Button>
                    </Link>
                </nav>
            </div>

            <nav className="flex items-center gap-4">
                {/* Desktop Nav Links */}
                <div className="hidden md:flex items-center gap-6 mr-4">
                    {!isBusinessPage ? (
                        <>
                            <Link href="/search" className="text-sm font-bold text-gray-600 hover:text-primary transition-colors flex items-center gap-2">
                                <Search className="h-4 w-4" />
                                Find Food
                            </Link>
                        </>
                    ) : (
                        <>
                            <Link href="/for-restaurants#features" className="text-sm font-bold text-gray-600 hover:text-primary transition-colors">Features</Link>
                            <Link href="/for-restaurants#pricing" className="text-sm font-bold text-gray-600 hover:text-primary transition-colors">Pricing</Link>
                        </>
                    )}
                </div>

                <div className="h-8 w-px bg-gray-200 hidden md:block" />

                {user ? (
                    <div className="flex items-center gap-2">
                        {userRole === 'owner' ? (
                            <>
                                <Link href="/dashboard">
                                    <Button variant={pathname.startsWith("/dashboard") ? "default" : "ghost"} className="font-bold flex items-center gap-2">
                                        <LayoutDashboard className="h-4 w-4" />
                                        Dashboard
                                    </Button>
                                </Link>
                                <Link href="/profile">
                                    <Button variant={pathname === "/profile" ? "default" : "ghost"} size="icon" className="rounded-full">
                                        <User className="h-4 w-4" />
                                    </Button>
                                </Link>
                            </>
                        ) : userRole === 'diner' ? (
                            <>
                                <Link href="/profile">
                                    <Button variant={pathname === "/profile" ? "default" : "ghost"} className="font-bold flex items-center gap-2">
                                        <User className="h-4 w-4" />
                                        Profile
                                    </Button>
                                </Link>
                                <Link href="/reservations">
                                    <Button variant={pathname === "/reservations" ? "default" : "ghost"} size="icon" className="rounded-full">
                                        <Utensils className="h-4 w-4" />
                                    </Button>
                                </Link>
                            </>
                        ) : (
                            // 'no_role' or 'loading'
                            <Link href="/onboarding">
                                <Button variant="outline" className="border-primary text-primary font-bold hover:bg-primary/5">
                                    Complete Setup
                                </Button>
                            </Link>
                        )}
                        <Button variant="outline" size="icon" onClick={handleLogout} className="rounded-full bg-red-50 hover:bg-red-100 border-red-100 text-red-600 transition-colors">
                            <LogOut className="h-4 w-4" />
                        </Button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        <Link href={`/login${isBusinessPage ? '?role=owner' : ''}`}>
                            <Button variant="ghost" className="font-bold text-gray-700">Log in</Button>
                        </Link>
                        <Link href={`/signup${isBusinessPage ? '?role=owner' : ''}`}>
                            <Button className="font-bold shadow-xl shadow-primary/20 rounded-full px-6 flex items-center gap-2">
                                {isBusinessPage ? 'Join as Owner' : 'Join Now'}
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </Link>
                    </div>
                )}
            </nav>
        </header>
    );
}
