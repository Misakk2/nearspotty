
import { useEffect } from "react";
import { useAuth } from "@/components/auth-provider";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";

export function useSubscriptionSync() {
    const { user } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!user) return;

        const syncSubscription = async () => {
            try {
                const token = await user.getIdToken();
                const res = await fetch("/api/subscription/sync", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                });

                if (res.status === 401) {
                    console.warn("[SubscriptionSync] Token invalid (401). Signing out...");
                    await auth.signOut();
                    router.push("/login");
                }
            } catch (error) {
                console.error("Failed to sync subscription:", error);
            }
        };

        syncSubscription();
    }, [user, router]);
}
