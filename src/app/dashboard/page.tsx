"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import RoleGuard from "@/components/RoleGuard";
import ProtectedRoute from "@/components/protected-route";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Users,
    Calendar,
    CreditCard,
    ExternalLink,
    Clock,
    AlertCircle,
    Loader2,
    Sparkles,
    ArrowRight,
    Check,
    X
} from "lucide-react";
import { doc, getDoc, collection, query, getDocs, orderBy, Timestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { BusinessPlan, BUSINESS_LIMITS, PLAN_TO_PRICE } from "@/lib/plan-limits";
import PricingSettings from "@/components/dashboard/PricingSettings";
import { MenuEditor } from "@/components/dashboard/MenuEditor";
import { RestaurantEditor } from "@/components/dashboard/RestaurantEditor";
import { TableManager } from "@/components/dashboard/TableManager";
import { OpeningHoursEditor } from "@/components/dashboard/OpeningHoursEditor";

interface Reservation {
    id: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    date: Timestamp;
    guests: number;
    time: string;
    placeId: string;
    status: 'pending' | 'confirmed' | 'cancelled' | 'rejected';
}

export default function BusinessDashboard() {
    const { user } = useAuth();
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [loading, setLoading] = useState(true);
    const [portalLoading, setPortalLoading] = useState(false);
    const [stats, setStats] = useState({
        total: 0,
        pending: 0,
        confirmed: 0
    });
    const [activeTab, setActiveTab] = useState<'overview' | 'menu' | 'tables' | 'hours' | 'pricing' | 'subscription' | 'settings'>('overview');
    const [restaurantData, setRestaurantData] = useState({
        placeId: "",
        name: "",
        address: "",
        avgCheck: 45,
        cuisine: "International",
        location: "Prague, CZ",
        seats: 50,
        priceLevel: 2
    });

    const handlePlanUpgrade = async (plan: string) => {
        if (!user) return;
        const priceId = PLAN_TO_PRICE[plan];
        if (!priceId) {
            toast.error("Invalid plan selected");
            return;
        }

        toast.loading("Redirecting to checkout...");
        try {
            const res = await fetch("/api/checkout", {
                method: "POST",
                body: JSON.stringify({
                    userId: user.uid,
                    userEmail: user.email,
                    priceId: priceId,
                    planName: plan
                })
            });
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                toast.dismiss();
                toast.error("Failed to start checkout");
            }
        } catch (error) {
            console.error("Upgrade error:", error);
            toast.dismiss();
            toast.error("Connection error. Please try again.");
        }
    };

    const handlePlanChange = async (newPlan: string) => {
        if (!user) return;
        
        const priceId = PLAN_TO_PRICE[newPlan];
        if (!priceId) {
            toast.error("Invalid plan selected");
            return;
        }

        // Confirm with user
        const isDowngrade = 
            (userPlan === "pro" && (newPlan === "basic" || newPlan === "free")) ||
            (userPlan === "basic" && newPlan === "free");

        if (isDowngrade) {
            const confirmed = confirm(
                `Are you sure you want to downgrade to ${newPlan}? Some features will be immediately disabled. You'll receive a prorated credit.`
            );
            if (!confirmed) return;
        }

        const loadingToast = toast.loading(`Changing to ${newPlan} plan...`);
        
        try {
            const token = await user.getIdToken();
            const res = await fetch("/api/subscription/change-plan", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    userId: user.uid,
                    newPriceId: priceId
                })
            });

            const data = await res.json();
            
            if (!res.ok) {
                throw new Error(data.error || "Failed to change plan");
            }

            toast.dismiss(loadingToast);
            toast.success(data.message || `Successfully changed to ${newPlan} plan!`);
            
            // Refresh page to reflect changes
            setTimeout(() => window.location.reload(), 1500);
            
        } catch (error) {
            console.error("Plan change error:", error);
            toast.dismiss(loadingToast);
            toast.error(error instanceof Error ? error.message : "Failed to change plan");
        }
    };
    const [userPlan, setUserPlan] = useState<BusinessPlan>("free");
    const [stripeCustomerId, setStripeCustomerId] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;

        const fetchBusinessData = async () => {
            const myDoc = await getDoc(doc(db, "users", user.uid));
            if (myDoc.exists()) {
                const userData = myDoc.data();

                // Set plan info - PRIORITIZE SUBSCRIPTION OBJECT
                const subscription = userData.subscription || {};
                const activeStatus = ['active', 'trialing'].includes(subscription.status);
                const rawTier = activeStatus ? subscription.tier : 'free';

                let tier: BusinessPlan = 'free';

                // Handle legacy fallback if tier is missing or 'premium' (diner tier shows as free in business dashboard)
                if (!rawTier || rawTier === 'premium') {
                    // Try legacy field, but be careful of 'premium' which is diner
                    const legacyPlan = userData.plan;
                    if (legacyPlan && legacyPlan !== 'premium') {
                        tier = legacyPlan as BusinessPlan;
                    } else {
                        tier = 'free';
                    }
                } else {
                    // It's a valid business tier (basic, pro, enterprise)
                    tier = rawTier as BusinessPlan;
                }

                setUserPlan(tier);
                setStripeCustomerId(userData.stripeCustomerId || subscription.stripeCustomerId || null);

                if (userData.business) {
                    const b = userData.business;
                    setRestaurantData(prev => ({
                        ...prev,
                        placeId: b.placeId,
                        name: b.name || prev.name,
                        address: b.address || prev.address,
                        avgCheck: b.avgCheck || prev.avgCheck,
                        cuisine: b.cuisineTypes?.join(", ") || b.cuisine || prev.cuisine,
                        location: b.location || prev.location,
                        seats: b.tableConfig?.totalSeats || b.seats || prev.seats,
                        priceLevel: b.price_level || prev.priceLevel
                    }));
                }
            }
        };

        const fetchReservations = async () => {
            try {
                const myDoc = await getDoc(doc(db, "users", user.uid));
                if (!myDoc.exists()) return;

                const userData = myDoc.data();
                const businessPlaceId = userData.business?.placeId;

                if (!businessPlaceId) {
                    console.warn("No business placeId found for user. Redirecting to onboarding.");
                    window.location.href = "/business-onboarding";
                    return;
                }

                // Query reservations for this restaurant
                // Note: Requires a composite index on [placeId, date]
                const q = query(
                    collection(db, "reservations"),
                    where("placeId", "==", businessPlaceId),
                    orderBy("date", "desc")
                );

                const querySnapshot = await getDocs(q);
                const data = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as Reservation[];

                setReservations(data);
                setStats({
                    total: data.length,
                    pending: data.filter(r => r.status === 'pending').length,
                    confirmed: data.filter(r => r.status === 'confirmed').length
                });
            } catch (error) {
                console.error("Error fetching reservations:", error);

                // Friendly error specifically for index requirement
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if ((error as any).code === 'failed-precondition') {
                    toast.error("Missing index. Check console for link.");
                } else {
                    toast.error("Failed to load dashboard data");
                }
            } finally {
                setLoading(false);
            }
        };

        fetchBusinessData();
        fetchReservations();
    }, [user]);

    const handleStatusUpdate = async (reservationId: string, newStatus: 'confirmed' | 'rejected') => {
        if (!user) return;

        // Optimistic update
        setReservations(prev => prev.map(r =>
            r.id === reservationId ? { ...r, status: newStatus } : r
        ));
        setStats(prev => ({
            ...prev,
            pending: prev.pending - 1,
            confirmed: newStatus === 'confirmed' ? prev.confirmed + 1 : prev.confirmed
        }));

        try {
            const token = await user.getIdToken();
            const res = await fetch("/api/reservations/update-status", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ reservationId, status: newStatus })
            });

            if (!res.ok) {
                const data = await res.json();
                toast.error(data.error || "Failed to update status");
                // Revert on error (could be improved by refetching)
            } else {
                toast.success(`Reservation ${newStatus}`);
            }
        } catch (error) {
            console.error("Status update error:", error);
            toast.error("Failed to call API");
        }
    };



    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <ProtectedRoute>
            <RoleGuard allowedRole="owner">
                <div className="min-h-screen bg-gray-50/50 p-6 md:p-10">
                    <div className="max-w-7xl mx-auto space-y-8">
                        {/* Header */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h1 className="text-3xl font-bold tracking-tight">{restaurantData.name || "Business Dashboard"}</h1>
                                <p className="text-muted-foreground mt-1">Manage your restaurant and track upcoming reservations.</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <Badge variant="outline" className={`px-4 py-1 text-sm bg-background ${userPlan !== "free" ? "border-primary" : ""}`}>
                                    <Sparkles className="h-4 w-4 mr-2 text-primary fill-primary/20" />
                                    {userPlan === "free" ? "Free Plan" : `${userPlan.charAt(0).toUpperCase() + userPlan.slice(1)} Plan`}
                                </Badge>
                            </div>
                        </div>

                        {/* Navigation Tabs */}
                        <div className="flex gap-2 p-1 bg-gray-100 rounded-2xl w-fit overflow-x-auto scrollbar-hide touch-pan-x max-w-full">
                            {[
                                { id: 'overview', label: 'Overview', icon: Users },
                                { id: 'menu', label: 'Menu', icon: Sparkles },
                                { id: 'tables', label: 'Tables', icon: Users },
                                { id: 'hours', label: 'Hours', icon: Clock },
                                { id: 'pricing', label: 'AI Pricing', icon: Sparkles },
                                { id: 'subscription', label: 'Subscription', icon: CreditCard },
                                { id: 'settings', label: 'Settings', icon: Calendar }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as 'overview' | 'menu' | 'tables' | 'hours' | 'pricing' | 'subscription' | 'settings')}
                                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                                >
                                    <tab.icon className="h-4 w-4" />
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {activeTab === 'menu' && restaurantData.placeId && (
                            <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                                <MenuEditor placeId={restaurantData.placeId} />
                            </motion.section>
                        )}

                        {activeTab === 'menu' && !restaurantData.placeId && (
                            <div className="text-center py-10">
                                <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                                <p className="text-muted-foreground mt-2">Loading restaurant data...</p>
                            </div>
                        )}

                        {activeTab === 'tables' && restaurantData.placeId && (
                            <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                                <TableManager placeId={restaurantData.placeId} />
                            </motion.section>
                        )}

                        {activeTab === 'tables' && !restaurantData.placeId && (
                            <div className="text-center py-10">
                                <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                                <p className="text-muted-foreground mt-2">Loading restaurant data...</p>
                            </div>
                        )}

                        {activeTab === 'hours' && restaurantData.placeId && (
                            <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl">
                                <OpeningHoursEditor placeId={restaurantData.placeId} />
                            </motion.section>
                        )}

                        {activeTab === 'pricing' && (
                            <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                                <PricingSettings
                                    placeId={restaurantData.placeId}
                                    location={restaurantData.location}
                                    cuisine={restaurantData.cuisine}
                                    avgCheck={restaurantData.avgCheck}
                                    seats={restaurantData.seats}
                                    priceLevel={restaurantData.priceLevel}
                                />
                            </motion.section>
                        )}

                        {activeTab === 'subscription' && (
                            <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl">
                                <div className="grid gap-6 md:grid-cols-2">
                                    {/* Current Plan Card */}
                                    <Card className="border-none shadow-sm">
                                        <CardHeader>
                                            <CardTitle className="flex items-center gap-2">
                                                <CreditCard className="h-5 w-5 text-primary" />
                                                Current Plan
                                            </CardTitle>
                                            <CardDescription>Your active subscription details</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                                                <div>
                                                    <p className="font-bold text-lg">
                                                        {userPlan === "free" ? "Free" : userPlan.charAt(0).toUpperCase() + userPlan.slice(1)} Plan
                                                    </p>
                                                    <p className="text-sm text-gray-500">
                                                        {userPlan === "free"
                                                            ? "Limited features"
                                                            : userPlan === "basic"
                                                                ? "€29/month"
                                                                : userPlan === "pro"
                                                                    ? "€79/month"
                                                                    : "€199/month"
                                                        }
                                                    </p>
                                                </div>
                                                <Badge className={`${userPlan !== "free" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                                                    {userPlan !== "free" ? "Active" : "Free Tier"}
                                                </Badge>
                                            </div>

                                            {/* Plan Features */}
                                            <div className="space-y-2">
                                                <p className="font-medium text-sm">Plan Features:</p>
                                                <ul className="text-sm text-gray-600 space-y-1">
                                                    <li>• {BUSINESS_LIMITS[userPlan].reservationsPerMonth === Infinity
                                                        ? "Unlimited"
                                                        : BUSINESS_LIMITS[userPlan].reservationsPerMonth} reservations/month</li>
                                                    <li>• €{BUSINESS_LIMITS[userPlan].perCoverFee.toFixed(2)} per-cover fee</li>
                                                    <li>• {BUSINESS_LIMITS[userPlan].aiInsights ? "✓" : "✗"} AI menu insights</li>
                                                    <li>• {BUSINESS_LIMITS[userPlan].smsNotifications ? "✓" : "✗"} SMS notifications</li>
                                                </ul>
                                            </div>
                                        </CardContent>
                                        <CardFooter className="flex flex-col gap-3">
                                            {stripeCustomerId ? (
                                                <Button
                                                    className="w-full"
                                                    onClick={async () => {
                                                        setPortalLoading(true);
                                                        try {
                                                            const res = await fetch("/api/create-portal-session", {
                                                                method: "POST",
                                                                headers: { "Content-Type": "application/json" },
                                                                body: JSON.stringify({
                                                                    customerId: stripeCustomerId,
                                                                    returnUrl: window.location.href
                                                                })
                                                            });
                                                            const data = await res.json();
                                                            if (data.url) {
                                                                window.location.href = data.url;
                                                            } else {
                                                                throw new Error(data.error || "Failed to open portal");
                                                            }
                                                        } catch (error) {
                                                            console.error("Portal error:", error);
                                                            toast.error("Failed to open subscription management");
                                                        } finally {
                                                            setPortalLoading(false);
                                                        }
                                                    }}
                                                    disabled={portalLoading}
                                                >
                                                    {portalLoading ? (
                                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                                    ) : (
                                                        <ExternalLink className="h-4 w-4 mr-2" />
                                                    )}
                                                    Manage Subscription
                                                </Button>
                                            ) : userPlan === "free" ? (
                                                <Button
                                                    className="w-full"
                                                    onClick={() => window.location.href = "/for-restaurants#pricing"}
                                                >
                                                    <Sparkles className="h-4 w-4 mr-2" />
                                                    Upgrade Your Plan
                                                </Button>
                                            ) : (
                                                <p className="text-sm text-gray-500 text-center">
                                                    Contact support to manage your subscription
                                                </p>
                                            )}
                                        </CardFooter>
                                    </Card>

                                    {/* Plan Change Card */}
                                    <Card className="border-2 border-primary/20 shadow-sm bg-gradient-to-br from-primary/5 to-orange-500/5">
                                        <CardHeader>
                                            <CardTitle className="flex items-center gap-2">
                                                <Sparkles className="h-5 w-5 text-primary" />
                                                {userPlan === "free" ? "Upgrade Your Plan" : "Change Your Plan"}
                                            </CardTitle>
                                            <CardDescription>
                                                {userPlan === "free" 
                                                    ? "Select a plan to unlock more features"
                                                    : "Upgrade or downgrade your subscription"}
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="space-y-4">
                                                {/* Show Free option only if on paid plan */}
                                                {userPlan !== "free" && stripeCustomerId && (
                                                    <button
                                                        onClick={() => {
                                                            const confirmed = confirm("Are you sure you want to cancel your subscription? You'll be downgraded to the free plan at the end of your billing period.");
                                                            if (confirmed) {
                                                                window.open(`/api/create-portal-session`, "_blank");
                                                            }
                                                        }}
                                                        className="w-full p-4 bg-white rounded-xl border text-left hover:border-gray-400 transition-all group"
                                                    >
                                                        <div className="flex justify-between items-center">
                                                            <div>
                                                                <p className="font-bold text-gray-700">Free Plan</p>
                                                                <p className="text-sm text-gray-500">10 reservations/mo - Basic features</p>
                                                            </div>
                                                            <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-gray-600 transition-colors" />
                                                        </div>
                                                    </button>
                                                )}

                                                {/* Basic Plan */}
                                                {userPlan !== "basic" && (
                                                    <button
                                                        onClick={() => userPlan === "free" ? handlePlanUpgrade('basic') : handlePlanChange('basic')}
                                                        className="w-full p-4 bg-white rounded-xl border text-left hover:border-primary transition-all group"
                                                    >
                                                        <div className="flex justify-between items-center">
                                                            <div>
                                                                <p className="font-bold">Basic Plan - €29/mo</p>
                                                                <p className="text-sm text-gray-500">50 reservations/mo, restaurant profile</p>
                                                            </div>
                                                            <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-primary transition-colors" />
                                                        </div>
                                                    </button>
                                                )}

                                                {/* Pro Plan */}
                                                {userPlan !== "pro" && (
                                                    <button
                                                        onClick={() => userPlan === "free" ? handlePlanUpgrade('pro') : handlePlanChange('pro')}
                                                        className="w-full p-4 bg-white rounded-xl border border-primary/30 text-left hover:border-primary transition-all group relative overflow-hidden"
                                                    >
                                                        <div className="absolute top-0 right-0 bg-primary text-white text-[10px] px-2 py-0.5 font-bold rounded-bl-lg">
                                                            POPULAR
                                                        </div>
                                                        <div className="flex justify-between items-center">
                                                            <div>
                                                                <p className="font-bold">Pro Plan - €79/mo</p>
                                                                <p className="text-sm text-gray-500">Unlimited reservations, AI insights, SMS</p>
                                                            </div>
                                                            <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-primary transition-colors" />
                                                        </div>
                                                    </button>
                                                )}
                                            </div>
                                        </CardContent>
                                        <CardFooter>
                                            <Link href="/for-restaurants#pricing" className="w-full">
                                                <Button variant="ghost" className="w-full">
                                                    Compare All Features
                                                </Button>
                                            </Link>
                                        </CardFooter>
                                    </Card>
                                </div>
                            </motion.section>
                        )}

                        {activeTab === 'settings' && (
                            <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl">
                                {restaurantData.placeId ? (
                                    <RestaurantEditor placeId={restaurantData.placeId} />
                                ) : (
                                    <div className="text-center py-10">
                                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                                        <p className="text-muted-foreground mt-2">Loading restaurant data...</p>
                                    </div>
                                )}
                            </motion.section>
                        )}

                        {activeTab === 'overview' && (
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">

                                {/* Stats Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <Card className="border-none shadow-sm shadow-primary/5">
                                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                                            <CardTitle className="text-sm font-medium">Total Reservations</CardTitle>
                                            <Users className="h-4 w-4 text-muted-foreground" />
                                        </CardHeader>
                                        <CardContent>
                                            <div className="text-2xl font-bold">{stats.total}</div>
                                            <p className="text-xs text-muted-foreground mt-1">+12% from last month</p>
                                        </CardContent>
                                    </Card>
                                    <Card className="border-none shadow-sm shadow-primary/5">
                                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                                            <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
                                            <Clock className="h-4 w-4 text-yellow-500" />
                                        </CardHeader>
                                        <CardContent>
                                            <div className="text-2xl font-bold">{stats.pending}</div>
                                            <p className="text-xs text-muted-foreground mt-1">Require immediate attention</p>
                                        </CardContent>
                                    </Card>
                                    <Card className="border-none shadow-sm shadow-primary/5">
                                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                                            <CardTitle className="text-sm font-medium">Confirmed Today</CardTitle>
                                            <Calendar className="h-4 w-4 text-green-500" />
                                        </CardHeader>
                                        <CardContent>
                                            <div className="text-2xl font-bold">{stats.confirmed}</div>
                                            <p className="text-xs text-muted-foreground mt-1">Across 8 lunch slots</p>
                                        </CardContent>
                                    </Card>
                                </div>

                                {/* Reservations List */}
                                <Card className="border-none shadow-sm">
                                    <CardHeader>
                                        <CardTitle>Recent Reservations</CardTitle>
                                        <CardDescription>A list of the latest bookings for your restaurant.</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-4">
                                            {reservations.length === 0 ? (
                                                <div className="text-center py-10 text-muted-foreground">
                                                    <AlertCircle className="h-10 w-10 mx-auto mb-2 opacity-20" />
                                                    <p>No reservations found yet.</p>
                                                </div>
                                            ) : (
                                                <>
                                                    {/* Mobile Card View */}
                                                    <div className="md:hidden space-y-4">
                                                        {reservations.map((res) => (
                                                            <Card key={res.id} className="p-4 shadow-sm">
                                                                <div className="space-y-3">
                                                                    <div className="flex items-start justify-between">
                                                                        <div>
                                                                            <h3 className="font-semibold text-base">{res.customerName}</h3>
                                                                            <p className="text-sm text-gray-600">{res.customerEmail}</p>
                                                                            <p className="text-sm text-gray-600">{res.customerPhone}</p>
                                                                        </div>
                                                                        <Badge className={
                                                                            res.status === 'confirmed' ? 'bg-green-100 text-green-700 border-none' :
                                                                                res.status === 'pending' ? 'bg-yellow-100 text-yellow-700 border-none' :
                                                                                    'bg-red-100 text-red-700 border-none'
                                                                        }>
                                                                            {res.status}
                                                                        </Badge>
                                                                    </div>
                                                                    <div className="flex items-center gap-4 text-sm text-gray-600">
                                                                        <div className="flex items-center gap-1">
                                                                            <Calendar className="h-4 w-4" />
                                                                            <span>{res.date.toDate().toLocaleDateString()}</span>
                                                                        </div>
                                                                        <div className="flex items-center gap-1">
                                                                            <Clock className="h-4 w-4" />
                                                                            <span>{res.time}</span>
                                                                        </div>
                                                                        <div className="flex items-center gap-1">
                                                                            <Users className="h-4 w-4" />
                                                                            <span>{res.guests}</span>
                                                                        </div>
                                                                    </div>
                                                                    {res.status === 'pending' && (
                                                                        <div className="flex gap-2 pt-2">
                                                                            <Button
                                                                                size="sm"
                                                                                variant="outline"
                                                                                className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                                                                                onClick={() => handleStatusUpdate(res.id, 'rejected')}
                                                                            >
                                                                                <X className="h-4 w-4 mr-1" />
                                                                                Reject
                                                                            </Button>
                                                                            <Button
                                                                                size="sm"
                                                                                variant="outline"
                                                                                className="flex-1 text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200"
                                                                                onClick={() => handleStatusUpdate(res.id, 'confirmed')}
                                                                            >
                                                                                <Check className="h-4 w-4 mr-1" />
                                                                                Confirm
                                                                            </Button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </Card>
                                                        ))}
                                                    </div>

                                                    {/* Desktop Table View */}
                                                    <div className="hidden md:block overflow-x-auto">
                                                        <table className="w-full text-sm text-left">
                                                            <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                                                                <tr>
                                                                    <th className="px-6 py-3 font-semibold">Customer</th>
                                                                    <th className="px-6 py-3 font-semibold">Date & Time</th>
                                                                    <th className="px-6 py-3 font-semibold text-center">Party</th>
                                                                    <th className="px-6 py-3 font-semibold">Contact</th>
                                                                    <th className="px-6 py-3 font-semibold">Status</th>
                                                                    <th className="px-6 py-3 font-semibold text-right">Actions</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y">
                                                                {reservations.map((res) => (
                                                                    <tr key={res.id} className="hover:bg-gray-50/80 transition-colors">
                                                                        <td className="px-6 py-4 font-medium">{res.customerName}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                                            <div className="flex flex-col">
                                                                                <span className="font-medium">{res.date.toDate().toLocaleDateString()}</span>
                                                                                <span className="text-gray-500 text-xs">{res.time}</span>
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-6 py-4 text-center">
                                                                            <Badge variant="secondary" className="font-bold">{res.guests} pers.</Badge>
                                                                        </td>
                                                                        <td className="px-6 py-4 text-xs text-gray-500">
                                                                            <div>{res.customerEmail}</div>
                                                                            <div>{res.customerPhone}</div>
                                                                        </td>
                                                                        <td className="px-6 py-4">
                                                                            <Badge className={
                                                                                res.status === 'confirmed' ? 'bg-green-100 text-green-700 hover:bg-green-200 border-none' :
                                                                                    res.status === 'pending' ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200 border-none' :
                                                                                        'bg-red-100 text-red-700 border-none'
                                                                            }>
                                                                                {res.status}
                                                                            </Badge>
                                                                        </td>
                                                                        <td className="px-6 py-4 text-right">
                                                                            {res.status === 'pending' && (
                                                                                <div className="flex justify-end gap-2">
                                                                                    <Button
                                                                                        size="sm"
                                                                                        variant="outline"
                                                                                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                                                                                        onClick={() => handleStatusUpdate(res.id, 'rejected')}
                                                                                    >
                                                                                        <X className="h-4 w-4" />
                                                                                    </Button>
                                                                                    <Button
                                                                                        size="sm"
                                                                                        variant="outline"
                                                                                        className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200"
                                                                                        onClick={() => handleStatusUpdate(res.id, 'confirmed')}
                                                                                    >
                                                                                        <Check className="h-4 w-4" />
                                                                                    </Button>
                                                                                </div>
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        )}
                    </div>
                </div>
            </RoleGuard>
        </ProtectedRoute>
    );
}
