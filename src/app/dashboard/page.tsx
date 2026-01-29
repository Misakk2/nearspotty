"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import RoleGuard from "@/components/RoleGuard";
import ProtectedRoute from "@/components/protected-route";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
    Users,
    Calendar,
    CreditCard,
    ExternalLink,
    Clock,
    AlertCircle,
    Loader2,
    Sparkles,
    ArrowRight
} from "lucide-react";
import { doc, getDoc, updateDoc, collection, query, getDocs, orderBy, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { BusinessPlan, BUSINESS_LIMITS, PLAN_TO_PRICE } from "@/lib/plan-limits";
import PricingSettings from "@/components/dashboard/PricingSettings";

interface Reservation {
    id: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    date: Timestamp;
    guests: number;
    time: string;
    status: 'pending' | 'confirmed' | 'cancelled';
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
    const [activeTab, setActiveTab] = useState<'overview' | 'pricing' | 'subscription' | 'settings'>('overview');
    const [restaurantData, setRestaurantData] = useState({
        name: "",
        address: "",
        avgCheck: 45,
        cuisine: "International",
        location: "Prague, CZ"
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
    const [userPlan, setUserPlan] = useState<BusinessPlan>("free");
    const [stripeCustomerId, setStripeCustomerId] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;

        const fetchBusinessData = async () => {
            const myDoc = await getDoc(doc(db, "users", user.uid));
            if (myDoc.exists()) {
                const userData = myDoc.data();

                // Set plan info
                setUserPlan((userData.plan as BusinessPlan) || "free");
                setStripeCustomerId(userData.stripeCustomerId || null);

                if (userData.business) {
                    const b = userData.business;
                    setRestaurantData(prev => ({
                        ...prev,
                        name: b.name || prev.name,
                        address: b.address || prev.address,
                        avgCheck: b.avgCheck || prev.avgCheck,
                        cuisine: b.cuisineTypes?.join(", ") || b.cuisine || prev.cuisine,
                        location: b.location || prev.location
                    }));
                }
            }
        };

        const fetchReservations = async () => {
            try {
                const q = query(
                    collection(db, "reservations"),
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
                toast.error("Failed to load dashboard data");
            } finally {
                setLoading(false);
            }
        };

        fetchBusinessData();
        fetchReservations();
    }, [user]);

    const handleUpdateSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        try {
            await updateDoc(doc(db, "users", user.uid), {
                business: {
                    ...restaurantData,
                    updatedAt: new Date().toISOString()
                }
            });
            toast.success("Settings updated!");
        } catch (error) {
            console.error("Update settings error:", error);
            toast.error("Failed to update settings");
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
                        <div className="flex gap-2 p-1 bg-gray-100 rounded-2xl w-fit overflow-x-auto">
                            {[
                                { id: 'overview', label: 'Overview', icon: Users },
                                { id: 'pricing', label: 'AI Pricing', icon: Sparkles },
                                { id: 'subscription', label: 'Subscription', icon: CreditCard },
                                { id: 'settings', label: 'Settings', icon: Calendar }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as 'overview' | 'pricing' | 'subscription' | 'settings')}
                                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                                >
                                    <tab.icon className="h-4 w-4" />
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {activeTab === 'pricing' && (
                            <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                                <PricingSettings
                                    location={restaurantData.location}
                                    cuisine={restaurantData.cuisine}
                                    avgCheck={restaurantData.avgCheck}
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
                                                    <li>• {BUSINESS_LIMITS[userPlan].priorityListing ? "✓" : "✗"} Priority listing</li>
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

                                    {/* Quick Upgrade Card */}
                                    {userPlan !== "enterprise" && (
                                        <Card className="border-2 border-primary/20 shadow-sm bg-gradient-to-br from-primary/5 to-orange-500/5">
                                            <CardHeader>
                                                <CardTitle className="flex items-center gap-2">
                                                    <Sparkles className="h-5 w-5 text-primary" />
                                                    Upgrade Your Plan
                                                </CardTitle>
                                                <CardDescription>Select a plan to unlock more features</CardDescription>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="space-y-4">
                                                    {userPlan === "free" && (
                                                        <button
                                                            onClick={() => handlePlanUpgrade('basic')}
                                                            className="w-full p-4 bg-white rounded-xl border text-left hover:border-primary transition-all group"
                                                        >
                                                            <div className="flex justify-between items-center">
                                                                <div>
                                                                    <p className="font-bold">Basic Plan - €29/mo</p>
                                                                    <p className="text-sm text-gray-500">50 reservations, restaurant profile</p>
                                                                </div>
                                                                <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-primary transition-colors" />
                                                            </div>
                                                        </button>
                                                    )}
                                                    {(userPlan === "free" || userPlan === "basic") && (
                                                        <button
                                                            onClick={() => handlePlanUpgrade('pro')}
                                                            className="w-full p-4 bg-white rounded-xl border border-primary/30 text-left hover:border-primary transition-all group relative overflow-hidden"
                                                        >
                                                            <div className="absolute top-0 right-0 bg-primary text-white text-[10px] px-2 py-0.5 font-bold rounded-bl-lg">
                                                                POPULAR
                                                            </div>
                                                            <div className="flex justify-between items-center">
                                                                <div>
                                                                    <p className="font-bold">Pro Plan - €79/mo</p>
                                                                    <p className="text-sm text-gray-500">Unlimited reservations, AI insights</p>
                                                                </div>
                                                                <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-primary transition-colors" />
                                                            </div>
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handlePlanUpgrade('enterprise')}
                                                        className="w-full p-4 bg-white rounded-xl border text-left hover:border-primary transition-all group"
                                                    >
                                                        <div className="flex justify-between items-center">
                                                            <div>
                                                                <p className="font-bold">Enterprise Plan - €199/mo</p>
                                                                <p className="text-sm text-gray-500">Multi-location & dedicated support</p>
                                                            </div>
                                                            <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-primary transition-colors" />
                                                        </div>
                                                    </button>
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
                                    )}
                                </div>
                            </motion.section>
                        )}

                        {activeTab === 'settings' && (
                            <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl">
                                <Card className="border-none shadow-sm">
                                    <CardHeader>
                                        <CardTitle>Restaurant Settings</CardTitle>
                                        <CardDescription>Update your public restaurant profile.</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <form onSubmit={handleUpdateSettings} className="space-y-6">
                                            <div className="space-y-2">
                                                <Label>Restaurant Name</Label>
                                                <Input
                                                    value={restaurantData.name}
                                                    onChange={e => setRestaurantData({ ...restaurantData, name: e.target.value })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Business Address</Label>
                                                <Input
                                                    value={restaurantData.address}
                                                    onChange={e => setRestaurantData({ ...restaurantData, address: e.target.value })}
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <Label>Average Check (€)</Label>
                                                    <Input
                                                        type="number"
                                                        value={restaurantData.avgCheck}
                                                        onChange={e => setRestaurantData({ ...restaurantData, avgCheck: parseInt(e.target.value) })}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Cuisine</Label>
                                                    <Input
                                                        value={restaurantData.cuisine}
                                                        onChange={e => setRestaurantData({ ...restaurantData, cuisine: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                            <Button type="submit" className="w-full h-12 rounded-xl font-bold">Save Settings</Button>
                                        </form>
                                    </CardContent>
                                </Card>
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
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-sm text-left">
                                                        <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                                                            <tr>
                                                                <th className="px-6 py-3 font-semibold">Customer</th>
                                                                <th className="px-6 py-3 font-semibold">Date & Time</th>
                                                                <th className="px-6 py-3 font-semibold text-center">Party</th>
                                                                <th className="px-6 py-3 font-semibold">Contact</th>
                                                                <th className="px-6 py-3 font-semibold">Status</th>
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
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
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
