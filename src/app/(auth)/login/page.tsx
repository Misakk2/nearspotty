"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import toast, { Toaster } from "react-hot-toast";

export default function LoginPage() {
    const router = useRouter();
    const { user, userRole, loading: authLoading, completedOnboarding } = useAuth();
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Wait for auth to fully load AND userRole to be determined
        if (!authLoading && user && userRole !== null) {
            // Redirect based on role and onboarding status
            if (userRole === "owner") {
                router.push("/dashboard");
            } else if (userRole === "diner") {
                router.push(completedOnboarding ? "/search" : "/onboarding");
            } else if (userRole === "no_role") {
                router.push("/onboarding");
            }
        }
    }, [user, userRole, authLoading, completedOnboarding, router]);

    const handleEmailLogin = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        const formData = new FormData(e.currentTarget);
        const email = formData.get("email") as string;
        const password = formData.get("password") as string;

        try {
            await signInWithEmailAndPassword(auth, email, password);
            toast.success("Logged in successfully!");
            // useEffect will handle redirect after role is loaded
        } catch (error: unknown) {
            console.error(error);
            const message = error instanceof Error ? error.message : "Failed to login";
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setLoading(true);
        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
            toast.success("Logged in successfully!");
            // useEffect will handle redirect after role is loaded
        } catch (error: unknown) {
            console.error(error);
            const message = error instanceof Error ? error.message : "Failed to login with Google";
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="w-full">
            <Toaster position="top-center" />
            <CardHeader>
                <CardTitle className="text-2xl text-center">Welcome back</CardTitle>
                <CardDescription className="text-center">Sign in to your account to continue</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleEmailLogin} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" name="email" type="email" placeholder="m@example.com" required />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <Input id="password" name="password" type="password" required />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? "Signing in..." : "Sign in"}
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
                <Button variant="outline" type="button" className="w-full" onClick={handleGoogleLogin} disabled={loading}>
                    Google
                </Button>
            </CardContent>
            <CardFooter className="justify-center">
                <p className="text-sm text-muted-foreground">
                    Don&apos;t have an account? <Link href="/signup" className="text-primary hover:underline font-semibold">Sign up</Link>
                </p>
            </CardFooter>
        </Card>
    );
}
