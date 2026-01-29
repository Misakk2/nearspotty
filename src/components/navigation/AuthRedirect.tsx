"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

const PUBLIC_PAGES = ["/", "/for-restaurants", "/login", "/signup"];

export default function AuthRedirect() {
    const { user, userRole, loading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!loading && user && PUBLIC_PAGES.includes(pathname)) {
            // Already logged in and visiting a public page
            if (userRole === "owner") {
                router.push("/dashboard");
            } else if (userRole === "diner") {
                router.push("/search");
            } else if (userRole === "no_role") {
                router.push("/onboarding");
            }
        }
    }, [user, userRole, loading, pathname, router]);

    return null;
}
