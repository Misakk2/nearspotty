"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";

interface AuthContextType {
    user: User | null;
    userRole: string | null;
    subscriptionTier: 'free' | 'premium';
    loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, userRole: null, subscriptionTier: 'free', loading: true });

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [userRole, setUserRole] = useState<string | null>(null);
    const [subscriptionTier, setSubscriptionTier] = useState<'free' | 'premium'>('free');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
            try {
                setUser(firebaseUser);
                if (firebaseUser) {
                    // Subscribe to real-time updates for the user document
                    const unsubscribeFirestore = onSnapshot(doc(db, "users", firebaseUser.uid), (docSnapshot) => {
                        if (docSnapshot.exists()) {
                            const data = docSnapshot.data();
                            setUserRole(data.role || "diner");
                            // Set subscription tier from Firestore
                            const tier = data.subscriptionTier || (data.plan === 'premium' ? 'premium' : 'free');
                            setSubscriptionTier(tier);
                        } else {
                            setUserRole("no_role");
                            setSubscriptionTier('free');
                        }
                        setLoading(false);
                    }, (error) => {
                        console.error("Firestore Listener Error:", error);
                        setUserRole("error");
                        setSubscriptionTier('free');
                        setLoading(false);
                    });

                    // Cleanup Firestore listener when auth state changes or component unmounts
                    return () => unsubscribeFirestore();
                } else {
                    setUserRole(null);
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

        return () => unsubscribeAuth();
    }, []);

    return (
        <AuthContext.Provider value={{ user, userRole, subscriptionTier, loading }}>
            {children}
        </AuthContext.Provider>
    );
}
