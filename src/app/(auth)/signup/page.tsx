"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createUserWithEmailAndPassword, updateProfile, signInWithPopup, GoogleAuthProvider, User } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import toast, { Toaster } from "react-hot-toast";
import { Suspense } from "react";

function SignupForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialRole = searchParams.get("role") || "user";
    const initialPlan = searchParams.get("plan") || "free";
    const [loading, setLoading] = useState(false);

    const saveUser = async (user: User) => {
        // Save basic info to Firestore
        try {
            await setDoc(doc(db, "users", user.uid), {
                email: user.email,
                displayName: user.displayName,
                photoURL: user.photoURL,
                role: initialRole,
                plan: initialPlan,
                createdAt: serverTimestamp(),
            }, { merge: true });
        } catch (e) {
            console.error("Error saving user to Firestore", e);
            toast.error("Account created but failed to save profile.");
        }
    };

    const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        const formData = new FormData(e.currentTarget);
        const name = formData.get("name") as string;
        const email = formData.get("email") as string;
        const password = formData.get("password") as string;

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(userCredential.user, {
                displayName: name,
            });
            await saveUser({ ...userCredential.user, displayName: name });

            toast.success("Account created successfully!");
            // Pass role to onboarding to skip role selection for business users
            const onboardingUrl = initialRole === "owner"
                ? "/onboarding?role=owner"
                : "/onboarding";
            router.push(onboardingUrl);
        } catch (error: unknown) {
            console.error(error);
            const message = error instanceof Error ? error.message : "Failed to create account";
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignup = async () => {
        setLoading(true);
        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            await saveUser(result.user);
            // Pass role to onboarding to skip role selection for business users
            const onboardingUrl = initialRole === "owner"
                ? "/onboarding?role=owner"
                : "/onboarding";
            router.push(onboardingUrl);
        } catch (error: unknown) {
            console.error(error);
            const message = error instanceof Error ? error.message : "Failed to sign up with Google";
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="w-full">
            <Toaster position="top-center" />
            <CardHeader>
                <CardTitle className="text-2xl text-center">Create an account</CardTitle>
                <CardDescription className="text-center">Enter your details to get started</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSignup} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Full Name</Label>
                        <Input id="name" name="name" type="text" placeholder="John Doe" required />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" name="email" type="email" placeholder="m@example.com" required />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <Input id="password" name="password" type="password" required minLength={6} />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? "Creating account..." : "Sign up"}
                    </Button>
                </form>
                <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
                    </div>
                </div>
                <Button variant="outline" type="button" className="w-full" onClick={handleGoogleSignup} disabled={loading}>
                    Google
                </Button>
            </CardContent>
            <CardFooter className="justify-center">
                <p className="text-sm text-muted-foreground">
                    Already have an account? <Link href="/login" className="text-primary hover:underline font-semibold">Sign in</Link>
                </p>
            </CardFooter>
        </Card>
    );
}

export default function SignupPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center p-8">Loading...</div>}>
            <SignupForm />
        </Suspense>
    );
}

