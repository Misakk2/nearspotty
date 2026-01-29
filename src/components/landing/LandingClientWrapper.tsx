"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Loader2 } from "lucide-react";
import Link from "next/link";

export function LandingClientWrapper() {
    const { user, userRole, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && user) {
            if (userRole === "owner") {
                router.push("/dashboard");
            } else if (userRole === "diner") {
                router.push("/search");
            } else if (userRole === "no_role") {
                router.push("/onboarding");
            }
        }
    }, [user, userRole, loading, router]);

    if (loading || (user && userRole !== "error")) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white/50 backdrop-blur-sm fixed inset-0 z-50">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                {user && (
                    <div className="text-center animate-in fade-in duration-700">
                        <p className="text-sm text-muted-foreground font-medium">Redirecting you to your workspace...</p>
                        <Link
                            href={userRole === "owner" ? "/dashboard" : (userRole === "diner" ? "/search" : "/onboarding")}
                            className="mt-4 text-xs text-primary underline block"
                        >
                            Click here if you are not redirected automatically
                        </Link>
                    </div>
                )}
            </div>
        );
    }

    return null;
}
