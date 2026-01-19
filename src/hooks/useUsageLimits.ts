"use client";

import { useEffect, useState, useCallback } from "react";
import { doc, getDoc, updateDoc, increment, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/auth-provider";
import {
    DinerPlan,
    BusinessPlan,
    canUseAICheck,
    canAcceptReservation,
    getRemainingAIChecks,
    getRemainingReservations
} from "@/lib/plan-limits";

interface UsageData {
    aiChecks: number;
    reservations: number;
    monthKey: string; // Format: "2026-01"
}

interface UsageLimitsResult {
    loading: boolean;
    error: string | null;
    usage: UsageData | null;
    plan: DinerPlan | BusinessPlan;
    role: "diner" | "owner";

    // Diner specific
    canUseAI: boolean;
    remainingAIChecks: number;
    incrementAIUsage: () => Promise<boolean>;

    // Business specific
    canAcceptReservation: boolean;
    remainingReservations: number;
    incrementReservationUsage: () => Promise<boolean>;

    // Refresh usage data
    refreshUsage: () => Promise<void>;
}

// Get current month key in format "2026-01"
function getCurrentMonthKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function useUsageLimits(): UsageLimitsResult {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [usage, setUsage] = useState<UsageData | null>(null);
    const [plan, setPlan] = useState<DinerPlan | BusinessPlan>("free");
    const [role, setRole] = useState<"diner" | "owner">("diner");

    const currentMonthKey = getCurrentMonthKey();

    const fetchUsage = useCallback(async () => {
        if (!user) {
            setLoading(false);
            return;
        }

        try {
            // Get user document for plan info
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                setPlan((userData.plan as DinerPlan | BusinessPlan) || "free");
                setRole(userData.role === "owner" ? "owner" : "diner");
            }

            // Get or create usage document for current month
            const usageRef = doc(db, "users", user.uid, "usage", currentMonthKey);
            const usageDoc = await getDoc(usageRef);

            if (usageDoc.exists()) {
                const data = usageDoc.data();
                setUsage({
                    aiChecks: data.aiChecks || 0,
                    reservations: data.reservations || 0,
                    monthKey: currentMonthKey,
                });
            } else {
                // Create initial usage document for the month
                const initialUsage = {
                    aiChecks: 0,
                    reservations: 0,
                    monthKey: currentMonthKey,
                    createdAt: new Date().toISOString(),
                };
                await setDoc(usageRef, initialUsage);
                setUsage(initialUsage);
            }
        } catch (err) {
            console.error("Error fetching usage:", err);
            setError("Failed to load usage data");
        } finally {
            setLoading(false);
        }
    }, [user, currentMonthKey]);

    useEffect(() => {
        fetchUsage();
    }, [fetchUsage]);

    const incrementAIUsage = useCallback(async (): Promise<boolean> => {
        if (!user || !usage) return false;

        // Check if can use before incrementing
        if (!canUseAICheck(plan as DinerPlan, usage.aiChecks)) {
            return false;
        }

        try {
            const usageRef = doc(db, "users", user.uid, "usage", currentMonthKey);
            await updateDoc(usageRef, {
                aiChecks: increment(1),
            });

            // Update local state
            setUsage(prev => prev ? { ...prev, aiChecks: prev.aiChecks + 1 } : null);
            return true;
        } catch (err) {
            console.error("Error incrementing AI usage:", err);
            return false;
        }
    }, [user, usage, plan, currentMonthKey]);

    const incrementReservationUsage = useCallback(async (): Promise<boolean> => {
        if (!user || !usage) return false;

        // Check if can accept before incrementing
        if (!canAcceptReservation(plan as BusinessPlan, usage.reservations)) {
            return false;
        }

        try {
            const usageRef = doc(db, "users", user.uid, "usage", currentMonthKey);
            await updateDoc(usageRef, {
                reservations: increment(1),
            });

            // Update local state
            setUsage(prev => prev ? { ...prev, reservations: prev.reservations + 1 } : null);
            return true;
        } catch (err) {
            console.error("Error incrementing reservation usage:", err);
            return false;
        }
    }, [user, usage, plan, currentMonthKey]);

    // Calculate limits
    const currentAIChecks = usage?.aiChecks || 0;
    const currentReservations = usage?.reservations || 0;

    return {
        loading,
        error,
        usage,
        plan,
        role,

        // Diner specific
        canUseAI: canUseAICheck(plan as DinerPlan, currentAIChecks),
        remainingAIChecks: getRemainingAIChecks(plan as DinerPlan, currentAIChecks),
        incrementAIUsage,

        // Business specific
        canAcceptReservation: canAcceptReservation(plan as BusinessPlan, currentReservations),
        remainingReservations: getRemainingReservations(plan as BusinessPlan, currentReservations),
        incrementReservationUsage,

        refreshUsage: fetchUsage,
    };
}
