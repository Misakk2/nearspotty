"use client";

import { usePathname } from "next/navigation";
import LandingNavbar from "@/components/navbar-landing";
import AppNavbar from "./AppNavbar";

export default function Navbar() {
    const pathname = usePathname();

    const isLandingPage = pathname === "/" || pathname === "/login" || pathname === "/signup" || pathname === "/for-restaurants";

    if (isLandingPage) {
        return <LandingNavbar />;
    }

    return <AppNavbar />;
}
