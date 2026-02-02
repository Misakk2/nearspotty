"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Utensils } from "lucide-react";

export default function LandingNavbar() {
    const { user } = useAuth();

    // If user is logged in, they should probably see the App Navbar or just a "Go to App" button?
    // But for landing page specific, we keep it simple.

    return (
        <header className="px-6 h-16 flex items-center justify-between border-b sticky top-0 bg-white/80 backdrop-blur-xl z-50">
            {/* Logo */}
            <div className="flex items-center gap-4">
                <Link href="/" className="flex items-center gap-2">
                    <div className="h-9 w-9 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 hover:scale-105 transition-transform">
                        <Utensils className="h-5 w-5 text-white" />
                    </div>
                    <span className="font-extrabold text-xl tracking-tight text-gray-900 bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600">
                        NearSpotty
                    </span>
                </Link>
            </div>

            {/* Navigation Links */}
            <div className="hidden md:flex items-center gap-6">
                <Link href="/for-restaurants" className="text-sm font-medium text-gray-600 hover:text-primary transition-colors">
                    For Business
                </Link>
            </div>

            {/* Auth Buttons */}
            <div className="flex items-center gap-2">
                {user ? (
                    <Link href="/search">
                        <Button className="font-bold rounded-full">Go to App</Button>
                    </Link>
                ) : (
                    <>
                        <Link href="/login">
                            <Button variant="ghost" size="sm" className="font-bold">Log in</Button>
                        </Link>
                        <Link href="/signup">
                            <Button size="sm" className="rounded-full font-bold shadow-lg shadow-primary/25">Join</Button>
                        </Link>
                    </>
                )}
            </div>
        </header>
    );
}
