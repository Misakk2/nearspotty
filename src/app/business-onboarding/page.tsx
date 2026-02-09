"use client";

import { useState, Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/auth-provider";
import ProtectedRoute from "@/components/protected-route";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import toast, { Toaster } from "react-hot-toast";
import { ArrowLeft, ArrowRight, Check, Store, Crown, Building2 } from "lucide-react";
import { ClaimSearch } from "@/components/onboarding/ClaimSearch";

const BUSINESS_CUISINE_OPTIONS = [
    "Italian", "French", "Mediterranean", "Greek", "Spanish",
    "American", "Mexican", "Brazilian", "Peruvian",
    "Japanese", "Chinese", "Thai", "Vietnamese", "Indian", "Korean",
    "Middle Eastern", "Turkish", "Moroccan",
    "Vegetarian/Vegan", "Seafood", "Steakhouse", "Fusion",
];

const PRICING_TIERS = [
    {
        id: "basic",
        name: "Basic",
        price: 29,
        priceId: "price_1SuvxLEOZfDm5I74RvCbvgkg", // Correct Test Mode ID
        description: "Perfect for single-location cafes",
        icon: Store,
        features: [
            "Up to 50 reservations/month",
            "Restaurant profile",
            "Basic dietary tags",
            "Email notifications",
        ],
        popular: false,
    },
    {
        id: "pro",
        name: "Pro",
        price: 79,
        priceId: "price_1SuvxLEOZfDm5I74QLxVBQKw", // Correct Test Mode ID
        description: "For growing restaurants",
        icon: Crown,
        features: [
            "UNLIMITED reservations",
            "AI menu optimization insights",
            "Email + SMS notifications",
        ],
        popular: true,
    },
    {
        id: "enterprise",
        name: "Enterprise",
        price: 199,
        priceId: "price_1SuvxMEOZfDm5I74I28E8OtJ", // Correct Test Mode ID
        description: "Multi-location chains",
        icon: Building2,
        features: [
            "Everything in Pro",
            "Multi-location management",
            "API access",
            "Dedicated account manager",
        ],
        popular: false,
    },
];

/**
 * Helper to check if subscription is effectively active
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isSubscriptionActive(subscription: any) {
    if (!subscription) return false;
    return ['active', 'trialing'].includes(subscription.status);
}

function BusinessOnboardingForm() {
    const { user } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();

    // Check if returning from successful payment
    const paymentSuccess = searchParams.get("payment") === "success";
    const preSelectedPlan = searchParams.get("plan") as string | null;

    const [step, setStep] = useState(paymentSuccess ? 1 : 0); // Skip plan selection if payment done
    const [loading, setLoading] = useState(false);
    const [hasActiveSubscription, setHasActiveSubscription] = useState(false);

    const [formData, setFormData] = useState({
        selectedPlan: preSelectedPlan || "basic",
        restaurantName: "",
        restaurantAddress: "",
        cuisineTypes: [] as string[],
        customCuisine: "",
        city: "",
        avgCheck: 25,
        claimedPlaceId: "",
    });

    const updateFormData = (field: string, value: string | string[] | number) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const handleNext = () => setStep((prev) => Math.min(prev + 1, 3));
    const handleBack = () => setStep((prev) => Math.max(prev - 1, 0));

    // Check subscription status on mount
    useEffect(() => {
        if (!user) return;

        const checkSubscription = async () => {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const data = userDoc.data();

                // If already has active subscription, skip to claim step
                if (isSubscriptionActive(data.subscription)) {
                    setHasActiveSubscription(true);
                    setStep(1);
                }

                // If completed onboarding and has subscription, redirect to dashboard
                if (data.preferences?.completedOnboarding && isSubscriptionActive(data.subscription)) {
                    router.push("/dashboard");
                }
            }
        };
        checkSubscription();
    }, [user, router]);

    /**
     * Handle plan selection - redirect to Stripe Checkout
     */
    const handlePlanSelect = async (planId: string) => {
        if (!user) return;
        setLoading(true);
        updateFormData("selectedPlan", planId);

        const selectedTier = PRICING_TIERS.find(t => t.id === planId);
        if (!selectedTier) {
            toast.error("Invalid plan selected");
            setLoading(false);
            return;
        }

        try {
            toast.loading("Starting your 14-day free trial...");

            const res = await fetch("/api/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: user.uid,
                    userEmail: user.email,
                    priceId: selectedTier.priceId,
                    planName: planId,
                    // Return to this page with success flag and session_id
                    successUrl: `${window.location.origin}/business-onboarding?payment=success&plan=${planId}&session_id={CHECKOUT_SESSION_ID}`,
                    cancelUrl: `${window.location.origin}/business-onboarding`,
                    trialDays: 14 // Start with a 14-day trial
                }),
            });

            const data = await res.json();
            if (data.url) {
                console.log("Redirecting to Stripe...", data.url);
                // Small delay to allow pending processes to settle
                setTimeout(() => {
                    window.location.href = data.url;
                }, 100);
            } else {
                toast.dismiss();
                toast.error("Failed to create checkout session");
            }
        } catch (error) {
            console.error("Checkout error:", error);
            toast.dismiss();
            toast.error("Failed to initiate checkout");
        } finally {
            setLoading(false);
        }
    };

    /**
     * Handle final submission - claim restaurant and save profile
     */
    const handleSubmit = async () => {
        if (!user) return;
        setLoading(true);

        const allCuisines = formData.customCuisine
            ? [...formData.cuisineTypes, formData.customCuisine]
            : formData.cuisineTypes;

        try {
            // 1. Claim the restaurant if placeId is selected
            if (formData.claimedPlaceId) {
                const token = await user.getIdToken();
                const claimRes = await fetch("/api/business/claim", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        placeId: formData.claimedPlaceId,
                        details: {
                            name: formData.restaurantName,
                            address: formData.restaurantAddress,
                            location: formData.city, // Should we geocode this? For now string is okay.
                            cuisineTypes: allCuisines,
                            avgCheck: formData.avgCheck || 25,
                        },
                        sessionId: searchParams.get("session_id") // Pass session ID for robust verification
                    })
                });

                if (!claimRes.ok) {
                    const errData = await claimRes.json();
                    toast.error(errData.error || "Failed to claim restaurant.");
                    setLoading(false);
                    return;
                }
            }

            // 2. Save user profile
            await setDoc(doc(db, "users", user.uid), {
                role: "owner",
                preferences: {
                    completedOnboarding: true
                },
                business: {
                    name: formData.restaurantName,
                    address: formData.restaurantAddress,
                    location: formData.city,
                    cuisineTypes: allCuisines,
                    avgCheck: formData.avgCheck || 25,
                    placeId: formData.claimedPlaceId || null,
                    createdAt: new Date().toISOString()
                }
            }, { merge: true });

            toast.success("Welcome to NearSpotty! 🎉");
            router.push("/dashboard");

        } catch (error) {
            console.error("Submit error:", error);
            toast.error("Failed to complete setup.");
        } finally {
            setLoading(false);
        }
    };

    const selectedTier = PRICING_TIERS.find(t => t.id === formData.selectedPlan);

    return (
        <Card className="w-full max-w-2xl shadow-lg">
            <CardHeader>
                <div className="flex justify-between items-center mb-4">
                    <div className="text-sm font-medium text-muted-foreground">
                        Step {step + 1} of {hasActiveSubscription ? 3 : 4}
                    </div>
                    <div className="flex gap-1">
                        {(hasActiveSubscription ? [0, 1, 2] : [0, 1, 2, 3]).map((i) => (
                            <div key={i} className={`h-2 w-8 rounded-full transition-colors ${i <= step ? 'bg-primary' : 'bg-gray-200'}`} />
                        ))}
                    </div>
                </div>
                <CardTitle className="text-2xl">
                    {step === 0 && "Start Your 14-Day Free Trial"}
                    {step === 1 && "Claim Your Restaurant"}
                    {step === 2 && "Restaurant Details"}
                    {step === 3 && "Ready to Go!"}
                </CardTitle>
                <CardDescription>
                    {step === 0 && "No charge today. Cancel anytime during the trial."}
                    {step === 1 && "Search for your restaurant to claim ownership."}
                    {step === 2 && "Tell us more about your cuisine and pricing."}
                    {step === 3 && "Review your information before getting started."}
                </CardDescription>
            </CardHeader>
            <CardContent className="min-h-[400px]">
                <AnimatePresence mode="wait">
                    {/* Step 0: Plan Selection */}
                    {step === 0 && !hasActiveSubscription && (
                        <motion.div
                            key="step0"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="grid grid-cols-1 md:grid-cols-3 gap-4"
                        >
                            {PRICING_TIERS.map((tier) => {
                                const Icon = tier.icon;
                                const isSelected = formData.selectedPlan === tier.id;
                                const isEnterprise = tier.id === 'enterprise';

                                return (
                                    <button
                                        key={tier.id}
                                        onClick={() => !isEnterprise && handlePlanSelect(tier.id)}
                                        disabled={loading || isEnterprise}
                                        className={`relative flex flex-col p-6 border-2 rounded-xl transition-all text-left ${isSelected
                                            ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                                            : 'border-gray-100 hover:border-gray-200'
                                            } ${tier.popular ? 'ring-2 ring-primary/30' : ''} ${isEnterprise ? 'opacity-60 cursor-not-allowed' : ''}`}
                                    >
                                        {tier.popular && (
                                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-white text-xs font-bold rounded-full">
                                                POPULAR
                                            </div>
                                        )}
                                        {isEnterprise && (
                                            <div className="absolute -top-3 right-2 px-2 py-1 bg-gray-200 text-gray-700 text-[10px] font-bold rounded-full">
                                                COMING SOON
                                            </div>
                                        )}
                                        <div className={`p-3 rounded-full mb-4 w-fit ${isSelected ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'}`}>
                                            <Icon className="h-6 w-6" />
                                        </div>
                                        <h3 className="font-bold text-lg">{tier.name}</h3>
                                        <p className="text-sm text-gray-500 mb-4">{tier.description}</p>
                                        <div className="mb-4">
                                            <span className="text-3xl font-extrabold">€{tier.price}</span>
                                            <span className="text-gray-500">/mo</span>
                                        </div>
                                        <div className="mb-3 text-xs font-semibold text-green-600 bg-green-50 px-2 py-1 rounded w-fit">
                                            14-Day Free Trial
                                        </div>
                                        <ul className="space-y-2 text-sm">
                                            {tier.features.map((feature, i) => (
                                                <li key={i} className="flex items-center gap-2">
                                                    <Check className="h-4 w-4 text-primary shrink-0" />
                                                    <span>{feature}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </button>
                                );
                            })}
                        </motion.div>
                    )}

                    {/* Step 1: Claim Restaurant */}
                    {step === 1 && (
                        <motion.div
                            key="step1"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-6"
                        >
                            <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
                                <Check className="h-5 w-5 text-green-600" />
                                <span className="text-green-700 font-medium">
                                    Trial active! Now let&apos;s set up your restaurant.
                                </span>
                            </div>

                            <div className="space-y-2">
                                <Label>Search for your restaurant</Label>
                                <p className="text-xs text-gray-500 mb-2">Try typing &quot;Restaurant Name City&quot; (e.g. &quot;McDonalds Košice&quot;)</p>
                                <ClaimSearch
                                    initialValue={formData.restaurantName}
                                    onSelect={(place) => {
                                        setFormData(prev => ({
                                            ...prev,
                                            restaurantName: place.name,
                                            restaurantAddress: place.address,
                                            claimedPlaceId: place.placeId,
                                            city: place.address.split(",").pop()?.trim() || ""
                                        }));
                                    }}
                                />
                                {formData.restaurantAddress && (
                                    <p className="text-sm text-green-600 flex items-center gap-1 mt-2">
                                        <Check className="h-3 w-3" />
                                        Selected: {formData.restaurantName}, {formData.restaurantAddress}
                                    </p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="restaurantAddress">Confirm Address & City</Label>
                                <Input
                                    id="restaurantAddress"
                                    placeholder="123 Foodie Street"
                                    value={formData.restaurantAddress}
                                    onChange={(e) => updateFormData("restaurantAddress", e.target.value)}
                                    className="mb-2"
                                />
                                <Input
                                    id="city"
                                    placeholder="City (e.g. Bratislava)"
                                    value={formData.city}
                                    onChange={(e) => updateFormData("city", e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="avgCheck">Avg. Check Size (€)</Label>
                                <Input
                                    id="avgCheck"
                                    type="number"
                                    placeholder="25"
                                    value={formData.avgCheck}
                                    onChange={(e) => updateFormData("avgCheck", parseInt(e.target.value) || 0)}
                                />
                            </div>
                        </motion.div>
                    )}

                    {/* Step 2: Restaurant Details */}
                    {step === 2 && (
                        <motion.div
                            key="step2"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-6"
                        >
                            <div className="space-y-2">
                                <Label>Cuisine Types (select all that apply)</Label>
                                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-3 border rounded-lg bg-gray-50">
                                    {BUSINESS_CUISINE_OPTIONS.map((cuisine) => {
                                        const isSelected = formData.cuisineTypes.includes(cuisine);
                                        return (
                                            <button
                                                key={cuisine}
                                                type="button"
                                                onClick={() => {
                                                    const current = formData.cuisineTypes;
                                                    updateFormData(
                                                        "cuisineTypes",
                                                        isSelected
                                                            ? current.filter(c => c !== cuisine)
                                                            : [...current, cuisine]
                                                    );
                                                }}
                                                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${isSelected
                                                    ? 'bg-primary text-white border-primary'
                                                    : 'bg-white border-gray-200 hover:border-primary/50'
                                                    }`}
                                            >
                                                {cuisine}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="customCuisine">Other Cuisine (optional)</Label>
                                <Input
                                    id="customCuisine"
                                    placeholder="e.g. Ethiopian, Georgian..."
                                    value={formData.customCuisine}
                                    onChange={(e) => updateFormData("customCuisine", e.target.value)}
                                />
                            </div>
                        </motion.div>
                    )}

                    {/* Step 3: Summary */}
                    {step === 3 && (
                        <motion.div
                            key="step3"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-6"
                        >
                            <div className="text-center py-4">
                                <div className="h-16 w-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Check className="h-8 w-8" />
                                </div>
                                <h3 className="text-xl font-bold">Almost Done!</h3>
                                <p className="text-gray-500">Review your information below.</p>
                            </div>

                            <div className="border rounded-lg p-6 bg-gray-50 space-y-4">
                                <h4 className="font-bold text-lg border-b pb-2">Business Summary</h4>
                                <div className="grid grid-cols-2 gap-y-3 text-sm">
                                    <span className="text-gray-500">Name:</span>
                                    <span className="font-medium">{formData.restaurantName || "Not set"}</span>

                                    <span className="text-gray-500">Address:</span>
                                    <span className="font-medium">{formData.restaurantAddress || "Not set"}</span>

                                    <span className="text-gray-500">City:</span>
                                    <span className="font-medium">{formData.city || "Not set"}</span>

                                    <span className="text-gray-500">Plan:</span>
                                    <span className="font-medium text-primary capitalize">{selectedTier?.name || formData.selectedPlan}</span>

                                    <span className="text-gray-500">Cuisines:</span>
                                    <span className="font-medium">
                                        {formData.cuisineTypes.length > 0
                                            ? formData.cuisineTypes.join(", ")
                                            : "Not set"}
                                    </span>

                                    <span className="text-gray-500">Avg. Check:</span>
                                    <span className="font-medium">€{formData.avgCheck}</span>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </CardContent>
            <CardFooter className="flex justify-between">
                <Button
                    variant="outline"
                    onClick={handleBack}
                    disabled={step === 0 || (step === 1 && hasActiveSubscription)}
                >
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>

                {step === 0 && !hasActiveSubscription ? (
                    <div className="text-sm text-gray-500">
                        Select a plan to continue
                    </div>
                ) : step < 3 ? (
                    <Button
                        onClick={handleNext}
                        disabled={step === 1 && (!formData.restaurantName || !formData.restaurantAddress)}
                    >
                        Next <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                ) : (
                    <Button onClick={handleSubmit} disabled={loading} className="bg-primary hover:bg-primary/90">
                        {loading ? "Saving..." : "Complete Setup"} <Check className="ml-2 h-4 w-4" />
                    </Button>
                )}
            </CardFooter>
        </Card>
    );
}

export default function BusinessOnboardingPage() {
    return (
        <ProtectedRoute>
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4">
                <Toaster position="top-center" />
                <Suspense fallback={<div>Loading...</div>}>
                    <BusinessOnboardingForm />
                </Suspense>
            </div>
        </ProtectedRoute>
    );
}
