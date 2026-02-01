
import { useEffect } from "react";
import { useAuth } from "@/components/auth-provider";

export function useSubscriptionSync() {
    const { user } = useAuth();

    useEffect(() => {
        if (!user) return;

        const syncSubscription = async () => {
            try {
                const token = await user.getIdToken();
                await fetch("/api/subscription/sync", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                });
            } catch (error) {
                console.error("Failed to sync subscription:", error);
            }
        };

        syncSubscription();
    }, [user]);
}
