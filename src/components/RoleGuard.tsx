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

    useEffect(() => {
        if (!loading && user) {
            if (userRole === "no_role") {
                router.push("/onboarding");
            } else if (userRole && userRole !== "error" && userRole !== allowedRole) {
                // Redirect to their actual home
                router.push(userRole === "owner" ? "/dashboard" : "/search");
            }
        }
    }, [user, userRole, loading, allowedRole, router]);

    if (loading || (user && !userRole)) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground animate-pulse">Verifying access...</p>
            </div>
        );
    }

    // If role doesn't match or is no_role, we return null while redirecting
    if (user && (userRole === "no_role" || (userRole !== allowedRole && userRole !== "error"))) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Redirecting to your workspace...</p>
            </div>
        );
    }

    return <>{children}</>;
}
