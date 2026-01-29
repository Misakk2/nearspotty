"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";

interface AuthContextType {
    user: User | null;
    userRole: string | null;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, userRole: null, loading: true });

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [userRole, setUserRole] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
            try {
                setUser(firebaseUser);
                if (firebaseUser) {
                    // Subscribe to real-time updates for the user document
                    const unsubscribeFirestore = onSnapshot(doc(db, "users", firebaseUser.uid), (docSnapshot) => {
                        if (docSnapshot.exists()) {
                            setUserRole(docSnapshot.data().role || "diner");
                        } else {
                            setUserRole("no_role");
                        }
                        setLoading(false);
                    }, (error) => {
                        console.error("Firestore Listener Error:", error);
                        setUserRole("error");
                        setLoading(false);
                    });

                    // Cleanup Firestore listener when auth state changes or component unmounts
                    return () => unsubscribeFirestore();
                } else {
                    setUserRole(null);
                    setLoading(false);
                }
            } catch (error) {
                console.error("Auth Provider Error:", error);
                setUserRole("error");
                setLoading(false);
            }
        });

        return () => unsubscribeAuth();
    }, []);

    return (
        <AuthContext.Provider value={{ user, userRole, loading }}>
            {children}
        </AuthContext.Provider>
    );
}
