"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";

interface AuthContextType {
    user: User | null;
    userRole: string | null;
    subscriptionTier: 'free' | 'premium' | 'basic' | 'pro' | 'enterprise';
    completedOnboarding: boolean;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    userRole: null,
    subscriptionTier: 'free',
    completedOnboarding: false,
    loading: true
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [userRole, setUserRole] = useState<string | null>(null);
    const [subscriptionTier, setSubscriptionTier] = useState<'free' | 'premium' | 'basic' | 'pro' | 'enterprise'>('free');
    const [completedOnboarding, setCompletedOnboarding] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let unsubscribeFirestore: (() => void) | null = null;

        const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
            // Cleanup previous listener if exists
            if (unsubscribeFirestore) {
                unsubscribeFirestore();
                unsubscribeFirestore = null;
            }

            try {
                setUser(firebaseUser);
                if (firebaseUser) {
                    console.log(`[AuthProvider] User detected: ${firebaseUser.uid}`);
                    // Subscribe to real-time updates for the user document
                    unsubscribeFirestore = onSnapshot(doc(db, "users", firebaseUser.uid), (docSnapshot) => {
                        if (docSnapshot.exists()) {
                            const data = docSnapshot.data();
                            console.log(`[AuthProvider] Role: ${data.role}, Onboarded: ${data.preferences?.completedOnboarding}`);

                            // Normalize "user" -> "diner" (legacy fix)
                            const role = (data.role === "user" || !data.role) ? "diner" : data.role;
                            setUserRole(role);

                            // Set completed onboarding status
                            setCompletedOnboarding(!!data.preferences?.completedOnboarding);

                            // Set subscription tier from Firestore (Priority: subscription.tier > tier > plan)
                            const tier = data.subscription?.tier || data.tier || (data.plan === 'premium' ? 'premium' : 'free');
                            setSubscriptionTier(tier);
                        } else {
                            console.log(`[AuthProvider] Document does not exist. Setting no_role.`);
                            setUserRole("no_role");
                            setCompletedOnboarding(false);
                            setSubscriptionTier('free');
                        }
                        setLoading(false);
                    }, (error) => {
                        console.error("Firestore Listener Error:", error);
                        setUserRole("error");
                        setSubscriptionTier('free');
                        setLoading(false);
                    });
                } else {
                    console.log(`[AuthProvider] No user.`);
                    setUserRole(null);
                    setCompletedOnboarding(false);
                    setSubscriptionTier('free');
                    setLoading(false);
                }
            } catch (error) {
                console.error("Auth Provider Error:", error);
                setUserRole("error");
                setSubscriptionTier('free');
                setLoading(false);
            }
        });

        return () => {
            unsubscribeAuth();
            if (unsubscribeFirestore) {
                unsubscribeFirestore();
            }
        };
    }, []);

    return (
        <AuthContext.Provider value={{ user, userRole, subscriptionTier, completedOnboarding, loading }}>
            {children}
        </AuthContext.Provider>
    );
}
