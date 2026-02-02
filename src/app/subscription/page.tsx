"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Check, Sparkles, Zap, Shield, Star, Loader2, Crown, AlertCircle, Calendar, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import ProtectedRoute from "@/components/protected-route";
import toast, { Toaster } from "react-hot-toast";

interface SubscriptionData {
    tier: "free" | "premium";
    status: string;
    currentPeriodEnd?: string;
    cancelAtPeriodEnd?: boolean;
    cancelAt?: string;
    usage: {
        count: number;
        remaining: number | string;
        limit: number | string;
        lastResetDate?: string;
    };
    email?: string;
    displayName?: string;
}

export default function SubscriptionPage() {
    const { user } = useAuth();
    const [upgradeLoading, setUpgradeLoading] = useState(false);
    const [cancelLoading, setCancelLoading] = useState(false);
    const [subscriptionData, setSubscriptionData] = useState<SubscriptionData | null>(null);

    // Fetch subscription status on mount
    useEffect(() => {
        if (user) {
            fetchSubscriptionStatus();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const fetchSubscriptionStatus = async () => {
        if (!user) return;
        try {
            const token = await user.getIdToken();
            const response = await fetch("/api/subscription/status", {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await response.json();
            setSubscriptionData(data);
        } catch (error) {
            console.error("Error fetching subscription:", error);
            toast.error("Failed to load subscription status");
        }
    };

    const handleUpgrade = async () => {
        if (!user) {
            toast.error("Please log in to upgrade");
            return;
        }
        setUpgradeLoading(true);
        try {
            const response = await fetch("/api/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: user.uid,
                    userEmail: user.email,
                    priceId: "price_1SuvxKEOZfDm5I749j79vou5", // Premium €9.99/month
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
            toast.error(error instanceof Error ? error.message : "Something went wrong");
        } finally {
            setUpgradeLoading(false);
        }
    };

    const handleCancelSubscription = async () => {
        if (!user) return;

        const confirmed = window.confirm(
            "Are you sure you want to cancel? You'll retain Premium access until the end of your billing period."
        );
        if (!confirmed) return;

        setCancelLoading(true);
        try {
            const token = await user.getIdToken();
            const response = await fetch("/api/subscription/cancel", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await response.json();

            if (data.success) {
                toast.success(data.message);
                fetchSubscriptionStatus(); // Refresh data
            } else {
                throw new Error(data.error || "Failed to cancel subscription");
            }
        } catch (error) {
            console.error("Cancel Error:", error);
            toast.error(error instanceof Error ? error.message : "Failed to cancel subscription");
        } finally {
            setCancelLoading(false);
        }
    };

    const handleManageBilling = async () => {
        if (!user) return;
        try {
            const response = await fetch("/api/create-portal-session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: user.uid }),
            });
            const data = await response.json();
            if (data.url) {
                window.location.href = data.url;
            }
        } catch (error) {
            console.error("Portal Error:", error);
            toast.error("Failed to open billing portal");
        }
    };

    const getStatusDisplay = () => {
        if (!subscriptionData) return { text: "Loading...", color: "bg-gray-100 text-gray-700" };

        switch (subscriptionData.status) {
            case "active":
                return { text: "Active", color: "bg-emerald-100 text-emerald-700" };
            case "active_until_period_end":
                const endDate = subscriptionData.currentPeriodEnd
                    ? new Date(subscriptionData.currentPeriodEnd).toLocaleDateString()
                    : "period end";
                return { text: `Active - Ends ${endDate}`, color: "bg-amber-100 text-amber-700" };
            case "canceled":
                return { text: "Canceled", color: "bg-red-100 text-red-700" };
            case "past_due":
                return { text: "Past Due", color: "bg-red-100 text-red-700" };
            default:
                return { text: subscriptionData.status || "None", color: "bg-gray-100 text-gray-700" };
        }
    };

    const isPremium = subscriptionData?.tier === "premium";
    const usageCount = subscriptionData?.usage?.count || 0;
    const usageLimit = typeof subscriptionData?.usage?.limit === "number" ? subscriptionData.usage.limit : 5;
    const usagePercent = isPremium ? 0 : Math.min(100, (usageCount / usageLimit) * 100);
    const statusDisplay = getStatusDisplay();

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
                <div className="max-w-4xl mx-auto space-y-8 relative">
                    {/* Mobile Back Button */}
                    <div className="md:hidden absolute -top-10 left-0">
                        <Link href="/search">
                            <Button variant="ghost" size="sm" className="gap-1 pl-0 text-muted-foreground">
                                <ChevronLeft className="h-4 w-4" /> Back
                            </Button>
                        </Link>
                    </div>

                    {/* User Identity & Status Card */}
                    <Card className="border-2">
                        <CardHeader className="pb-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                                        {user?.email?.[0]?.toUpperCase() || "U"}
                                    </div>
                                    <div>
                                        <CardTitle className="text-xl flex items-center gap-2">
                                            {subscriptionData?.displayName || user?.email?.split("@")[0] || "User"}
                                            {isPremium && (
                                                <Badge className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white border-none">
                                                    <Crown className="h-3 w-3 mr-1" /> Premium
                                                </Badge>
                                            )}
                                            {!isPremium && (
                                                <Badge variant="outline" className="text-muted-foreground">
                                                    Free
                                                </Badge>
                                            )}
                                        </CardTitle>
                                        <CardDescription>{user?.email}</CardDescription>
                                    </div>
                                </div>
                                <Badge className={statusDisplay.color}>
                                    {statusDisplay.text}
                                </Badge>
                            </div>
                        </CardHeader>

                        <CardContent className="space-y-4">
                            {/* Usage Meter (Free tier only) */}
                            {!isPremium && (
                                <div className="p-4 bg-gray-50 rounded-lg">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-medium">Monthly AI Searches</span>
                                        <span className="text-sm text-muted-foreground">
                                            {usageCount}/{usageLimit} used
                                        </span>
                                    </div>
                                    <Progress value={usagePercent} className="h-3" />
                                    {usagePercent >= 100 && (
                                        <div className="flex items-center gap-2 mt-2 text-amber-600 text-sm">
                                            <AlertCircle className="h-4 w-4" />
                                            Limit reached - Upgrade for unlimited searches!
                                        </div>
                                    )}
                                    {usagePercent > 0 && usagePercent < 100 && (
                                        <p className="text-sm text-muted-foreground mt-2">
                                            {subscriptionData?.usage?.remaining ?? 0} searches remaining this month
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Premium User Info */}
                            {isPremium && (
                                <div className="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg border border-purple-100">
                                    <div className="flex items-center gap-2 text-purple-700">
                                        <Sparkles className="h-5 w-5" />
                                        <span className="font-medium">Unlimited AI Searches</span>
                                    </div>
                                    {subscriptionData?.currentPeriodEnd && (
                                        <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                                            <Calendar className="h-4 w-4" />
                                            {subscriptionData.cancelAtPeriodEnd
                                                ? `Access until ${new Date(subscriptionData.currentPeriodEnd).toLocaleDateString()}`
                                                : `Next billing: ${new Date(subscriptionData.currentPeriodEnd).toLocaleDateString()}`
                                            }
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Manage Buttons */}
                            {isPremium && (
                                <div className="flex gap-3 pt-2">
                                    <Button variant="outline" onClick={handleManageBilling}>
                                        Manage Billing
                                    </Button>
                                    {!subscriptionData?.cancelAtPeriodEnd && (
                                        <Button
                                            variant="ghost"
                                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                            onClick={handleCancelSubscription}
                                            disabled={cancelLoading}
                                        >
                                            {cancelLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                            Cancel Subscription
                                        </Button>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Pricing Header */}
                    <div className="text-center space-y-4">
                        <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-none px-4 py-1 text-sm font-semibold">
                            Pricing Plans
                        </Badge>
                        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">
                            Elevate Your Dining Experience
                        </h1>
                        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                            Join NearSpotty Premium and get the most out of our AI-powered restaurant discovery.
                        </p>
                    </div>

                    {/* Pricing Cards */}
                    <div className="grid md:grid-cols-2 gap-8 text-left">
                        {/* Free Plan */}
                        <Card className={`flex flex-col border-2 ${!isPremium ? "border-primary" : "border-transparent"}`}>
                            {!isPremium && (
                                <div className="absolute top-0 right-0 bg-primary text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">
                                    Current Plan
                                </div>
                            )}
                            <CardHeader>
                                <CardTitle className="text-xl font-bold">Standard</CardTitle>
                                <CardDescription>Perfect for occasional diners</CardDescription>
                                <div className="mt-4">
                                    <span className="text-4xl font-bold">€0</span>
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
                                <Button variant="outline" className="w-full" disabled>
                                    {!isPremium ? "Current Plan" : "Downgrade"}
                                </Button>
                            </CardFooter>
                        </Card>

                        {/* Premium Plan */}
                        <Card className={`flex flex-col border-2 relative overflow-hidden ${isPremium ? "border-primary shadow-xl" : "border-purple-200"}`}>
                            {isPremium && (
                                <div className="absolute top-0 right-0 bg-primary text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">
                                    Current Plan
                                </div>
                            )}
                            {!isPremium && (
                                <div className="absolute top-0 right-0 bg-purple-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">
                                    Recommended
                                </div>
                            )}
                            <CardHeader>
                                <CardTitle className="text-xl font-bold flex items-center gap-2">
                                    Premium <Sparkles className="h-5 w-5 text-primary fill-primary" />
                                </CardTitle>
                                <CardDescription>For the ultimate food explorer</CardDescription>
                                <div className="mt-4">
                                    <span className="text-4xl font-bold text-primary">€9.99</span>
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
                                    disabled={upgradeLoading || isPremium}
                                >
                                    {isPremium ? "Current Plan" : (upgradeLoading ? "Processing..." : "Upgrade to Premium")}
                                </Button>
                            </CardFooter>
                        </Card>
                    </div>

                    {/* Trust Badges */}
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
                            <h3 className="font-bold">Cancel Anytime</h3>
                            <p className="text-sm text-gray-500">Keep access until period ends</p>
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
