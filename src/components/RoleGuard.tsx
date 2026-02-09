"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Loader2 } from "lucide-react";

interface RoleGuardProps {
    children: React.ReactNode;
    allowedRole: "diner" | "owner";
}

export default function RoleGuard({ children, allowedRole }: RoleGuardProps) {
    const { user, userRole, loading, completedOnboarding } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!loading && user) {
            console.log(`[RoleGuard] Checking access. Role: ${userRole}, Allowed: ${allowedRole}, Path: ${pathname}, Onboarded: ${completedOnboarding}`);

            // 1. Handle "No Role" Users -> Force Onboarding
            if (userRole === "no_role") {
                const allowedPaths = ["/onboarding", "/business-onboarding"];
                if (!allowedPaths.some(p => pathname.startsWith(p))) {
                    console.log("[RoleGuard] No role -> Redirecting to /onboarding");
                    router.push("/onboarding");
                }
                return;
            }

            // 2. Handle "Diner" Logic
            if (userRole === "diner") {
                // If aiming for Diner connection but hasn't completed onboarding -> Force Onboarding
                if (!completedOnboarding && !pathname.startsWith("/onboarding")) {
                    console.log("[RoleGuard] Diner not onboarded -> Redirecting to /onboarding");
                    router.push("/onboarding");
                    return;
                }

                // If aiming for Owner routes -> Redirect to Search
                if (allowedRole === "owner") {
                    console.log("[RoleGuard] Diner accessing Owner route -> Redirecting to /search");
                    router.push("/search");
                    return;
                }
            }

            // 3. Handle "Owner" Logic
            if (userRole === "owner") {
                // If aiming for Diner routes -> Redirect to Dashboard
                if (allowedRole === "diner") {
                    console.log("[RoleGuard] Owner accessing Diner route -> Redirecting to /dashboard");
                    router.push("/dashboard");
                    return;
                }
            }

            // 4. Handle "Error" Role
            if (userRole === "error") {
                console.error("[RoleGuard] User role error.");
                // Optionally redirect to an error page or stay put
            }
        }
    }, [user, userRole, loading, allowedRole, router, pathname, completedOnboarding]);

    if (loading || (user && !userRole)) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground animate-pulse">Verifying access...</p>
            </div>
        );
    }

    // Block render if we are about to redirect
    if (user) {
        if (userRole === "no_role" ||
            (userRole === "diner" && !completedOnboarding && !pathname.startsWith("/onboarding")) ||
            (userRole === "diner" && allowedRole === "owner") ||
            (userRole === "owner" && allowedRole === "diner")) {
            return (
                <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Redirecting...</p>
                </div>
            );
        }
    }

    return <>{children}</>;
}
