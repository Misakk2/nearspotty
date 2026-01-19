"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles, Zap, Shield, Star } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import ProtectedRoute from "@/components/protected-route";
import toast, { Toaster } from "react-hot-toast";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useEffect } from "react";

export default function SubscriptionPage() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [userRole, setUserRole] = useState<string | null>(null);

    useEffect(() => {
        if (user) {
            getDoc(doc(db, "users", user.uid)).then(snap => {
                if (snap.exists()) {
                    setUserRole(snap.data().role || "diner");
                }
            });
        }
    }, [user]);

    const handleUpgrade = async () => {
        if (!user) {
            toast.error("Please log in to upgrade");
            return;
        }
        setLoading(true);
        try {
            const response = await fetch("/api/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: user.uid,
                    userEmail: user.email,
                    priceId: "price_1SrDsEJCjItbR3I2XqbPKHZk", // Premium Subscription Price ID (9.99 EUR)
                }),
            });
            const data = await response.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                throw new Error(data.error || "Failed to create checkout session");
            }
        } catch (error) {
            console.error("Upgrade Error:", error);
            const errorMessage = error instanceof Error ? error.message : "Something went wrong";
            toast.error(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const features = [
        "Unlimited AI Suitability Checks",
        "Priority Restaurant Reservations",
        "Exclusive AI-driven Recommendations",
        "Early access to new features",
        "No advertisement (Coming soon)",
    ];

    return (
        <ProtectedRoute>
            <div className="min-h-screen bg-gray-50 py-12 px-4">
                <Toaster position="top-center" />
                <div className="max-w-4xl mx-auto space-y-8 text-center">
                    <div className="space-y-4">
                        <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-none px-4 py-1 text-sm font-semibold">
                            Pricing Plans
                        </Badge>
                        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">
                            Elevate Your Dining Experience
                        </h1>
                        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                            Join NearSpotty Premium and get the most out of our AI-powered restaurant discovery and booking.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8 mt-12 text-left">
                        {/* Free Plan */}
                        <Card className="flex flex-col border-2 border-transparent">
                            <CardHeader>
                                <CardTitle className="text-xl font-bold">Standard</CardTitle>
                                <CardDescription>Perfect for occasional diners</CardDescription>
                                <div className="mt-4">
                                    <span className="text-4xl font-bold">$0</span>
                                    <span className="text-gray-500">/month</span>
                                </div>
                            </CardHeader>
                            <CardContent className="flex-1 space-y-4">
                                <ul className="space-y-3 pt-4 border-t">
                                    <li className="flex items-center gap-3 text-sm">
                                        <Check className="h-4 w-4 text-green-500 shrink-0" />
                                        <span>5 AI Checks per month</span>
                                    </li>
                                    <li className="flex items-center gap-3 text-sm">
                                        <Check className="h-4 w-4 text-green-500 shrink-0" />
                                        <span>Basic Reservations</span>
                                    </li>
                                    <li className="flex items-center gap-3 text-sm text-gray-400">
                                        <div className="h-4 w-4 border rounded-full shrink-0" />
                                        <span>Priority Support</span>
                                    </li>
                                </ul>
                            </CardContent>
                            <CardFooter>
                                <Button variant="outline" className="w-full" disabled>Current Plan</Button>
                            </CardFooter>
                        </Card>

                        {/* Premium Plan */}
                        <Card className="flex flex-col border-2 border-primary shadow-xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 bg-primary text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">
                                Recommended
                            </div>
                            <CardHeader>
                                <CardTitle className="text-xl font-bold flex items-center gap-2">
                                    Premium <Sparkles className="h-5 w-5 text-primary fill-primary" />
                                </CardTitle>
                                <CardDescription>For the ultimate food explorer</CardDescription>
                                <div className="mt-4">
                                    <span className="text-4xl font-bold text-primary">$9.99</span>
                                    <span className="text-gray-500">/month</span>
                                </div>
                            </CardHeader>
                            <CardContent className="flex-1 space-y-4">
                                <ul className="space-y-3 pt-4 border-t">
                                    {features.map((feature, i) => (
                                        <li key={i} className="flex items-center gap-3 text-sm">
                                            <Zap className="h-4 w-4 text-primary shrink-0 fill-primary/20" />
                                            <span className="font-medium">{feature}</span>
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                            <CardFooter>
                                <Button
                                    className="w-full shadow-lg h-12 text-lg font-bold"
                                    onClick={handleUpgrade}
                                    disabled={loading || userRole === "premium"}
                                >
                                    {userRole === "premium" ? "Already Premium" : (loading ? "Processing..." : "Upgrade to Premium")}
                                </Button>
                            </CardFooter>
                        </Card>
                    </div>

                    <div className="pt-12 grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
                        <div className="space-y-2">
                            <div className="h-10 w-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center mx-auto mb-4">
                                <Shield className="h-6 w-6" />
                            </div>
                            <h3 className="font-bold">Secure Payment</h3>
                            <p className="text-sm text-gray-500">Processed securely by Stripe</p>
                        </div>
                        <div className="space-y-2">
                            <div className="h-10 w-10 bg-yellow-50 text-yellow-600 rounded-lg flex items-center justify-center mx-auto mb-4">
                                <Star className="h-6 w-6" />
                            </div>
                            <h3 className="font-bold">Best Value</h3>
                            <p className="text-sm text-gray-500">Save more with our premium features</p>
                        </div>
                        <div className="space-y-2">
                            <div className="h-10 w-10 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center mx-auto mb-4">
                                <Zap className="h-6 w-6" />
                            </div>
                            <h3 className="font-bold">Instant Access</h3>
                            <p className="text-sm text-gray-500">Start using premium benefits immediately</p>
                        </div>
                    </div>
                </div>
            </div>
        </ProtectedRoute>
    );
}
