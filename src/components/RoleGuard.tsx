"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Loader2 } from "lucide-react";

interface RoleGuardProps {
    children: React.ReactNode;
    allowedRole: "diner" | "owner";
}

export default function RoleGuard({ children, allowedRole }: RoleGuardProps) {
    const { user, userRole, loading } = useAuth();
    const router = useRouter();

    const pathname = window.location.pathname;

    useEffect(() => {
        if (!loading && user) {
            console.log(`[RoleGuard] Checking access. Role: ${userRole}, Allowed: ${allowedRole}, Path: ${pathname}`);
            if (userRole === "no_role") {
                if (pathname !== "/onboarding") {
                    console.log("[RoleGuard] Redirecting to /onboarding");
                    router.push("/onboarding");
                }
            } else if (userRole && userRole !== "error" && userRole !== allowedRole) {
                const target = userRole === "owner" ? "/dashboard" : "/search";
                if (pathname !== target) {
                    console.log(`[RoleGuard] Redirecting to ${target}`);
                    // Redirect to their actual home
                    router.push(target);
                }
            }
        }
    }, [user, userRole, loading, allowedRole, router, pathname]);

    if (loading || (user && !userRole)) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground animate-pulse">Verifying access...</p>
            </div>
        );
    }

    // If role doesn't match or is no_role, we return null while redirecting
    // Also treat "user" as "diner" for this check
    const effectiveRole = userRole === "user" ? "diner" : userRole;
    if (user && (userRole === "no_role" || (effectiveRole !== allowedRole && userRole !== "error"))) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Redirecting to your workspace...</p>
            </div>
        );
    }

    return <>{children}</>;
}
