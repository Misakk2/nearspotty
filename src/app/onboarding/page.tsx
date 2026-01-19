"use client";

import { useState, Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/auth-provider";
import ProtectedRoute from "@/components/protected-route";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import toast, { Toaster } from "react-hot-toast";
import { ArrowLeft, ArrowRight, Check, Utensils, User as UserIcon } from "lucide-react";

const DIETARY_OPTIONS = [
    { id: "vegan", label: "Vegan" },
    { id: "vegetarian", label: "Vegetarian" },
    { id: "gluten-free", label: "Gluten-Free" },
    { id: "lactose-free", label: "Lactose-Free" },
    { id: "kosher", label: "Kosher" },
    { id: "halal", label: "Halal" },
];

const CUISINE_OPTIONS = ["Italian", "Mexican", "Japanese", "Indian", "Chinese", "Thai", "American", "Mediterranean"];

// Business cuisine options with more variety
const BUSINESS_CUISINE_OPTIONS = [
    "Italian", "French", "Mediterranean", "Greek", "Spanish",
    "American", "Mexican", "Brazilian", "Peruvian",
    "Japanese", "Chinese", "Thai", "Vietnamese", "Indian", "Korean",
    "Middle Eastern", "Turkish", "Moroccan",
    "Vegetarian/Vegan", "Seafood", "Steakhouse", "Fusion",
];

function OnboardingForm() {
    const { user } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();

    // Check if role is pre-selected
    const preSelectedRole = searchParams.get("role") as "diner" | "owner" | null;
    const redirectPath = searchParams.get("redirect");

    const [step, setStep] = useState(preSelectedRole ? 1 : 0);
    const [loading, setLoading] = useState(false);
    const [userPlan, setUserPlan] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        role: preSelectedRole || "diner",
        dietary: [] as string[],
        allergies: "",
        cuisines: [] as string[],
        radius: 5,
        restaurantName: "",
        restaurantAddress: "",
        cuisineTypes: [] as string[], // Multiple cuisine selection for business
        customCuisine: "", // Custom cuisine if "Other" is selected
        city: "Bratislava",
        avgCheck: 25,
    });

    const updateFormData = (field: string, value: string | string[] | number) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const handleNext = () => setStep((prev) => Math.min(prev + 1, 3));
    const handleBack = () => setStep((prev) => Math.max(prev - 1, 0));

    useEffect(() => {
        if (!user) return;

        const checkOnboarding = async () => {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const data = userDoc.data();
                setUserPlan(data.plan || "free");
                if (data.preferences?.completedOnboarding) {
                    const role = data.role;
                    router.push(role === "owner" ? "/dashboard" : "/search");
                }
            }
        };
        checkOnboarding();
    }, [user, router]);

    const handleSubmit = async () => {
        if (!user) return;
        setLoading(true);

        // Combine selected cuisines with custom cuisine if provided
        const allCuisines = formData.customCuisine
            ? [...formData.cuisineTypes, formData.customCuisine]
            : formData.cuisineTypes;

        try {
            await setDoc(doc(db, "users", user.uid), {
                role: formData.role,
                preferences: {
                    dietary: formData.dietary,
                    allergies: formData.allergies,
                    cuisines: formData.cuisines,
                    radius: formData.radius,
                    completedOnboarding: true
                },
                business: formData.role === "owner" ? {
                    name: formData.restaurantName,
                    address: formData.restaurantAddress,
                    location: formData.city,
                    cuisineTypes: allCuisines,
                    avgCheck: formData.avgCheck || 25,
                    createdAt: new Date().toISOString()
                } : null
            }, { merge: true });

            toast.success("Onboarding completed!");

            // If it's a paid business plan, redirect to checkout with timeout
            if (formData.role === "owner" && userPlan && userPlan !== "free") {
                const planToPrice: Record<string, string> = {
                    'basic': 'price_1SqB26JCjItbR3I2jk3D6ULu',
                    'pro': 'price_1SqB27JCjItbR3I2ZJUroRHY',
                    'enterprise': 'price_1SqB27JCjItbR3I2rRZSNLWA'
                };

                const priceId = planToPrice[userPlan as keyof typeof planToPrice];
                if (priceId) {
                    // Attempt checkout with timeout
                    const attemptCheckout = async (attempt: number): Promise<boolean> => {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 3000);

                        try {
                            const res = await fetch("/api/checkout", {
                                method: "POST",
                                body: JSON.stringify({
                                    userId: user.uid,
                                    userEmail: user.email,
                                    priceId: priceId,
                                    planName: userPlan
                                }),
                                signal: controller.signal
                            });
                            clearTimeout(timeoutId);

                            const data = await res.json();
                            if (data.url) {
                                window.location.href = data.url;
                                return true;
                            }
                            return false;
                        } catch (error) {
                            clearTimeout(timeoutId);
                            console.error(`Checkout attempt ${attempt} failed:`, error);
                            return false;
                        }
                    };

                    toast.loading("Redirecting to checkout...");

                    // First attempt
                    let success = await attemptCheckout(1);

                    if (!success) {
                        toast.dismiss();
                        toast.error("Connection slow. Retrying...");
                        // Second attempt
                        success = await attemptCheckout(2);
                    }

                    if (!success) {
                        toast.dismiss();
                        toast.error("We're having issues. Please try again or contact support.");

                        // Send support email notification (best effort)
                        try {
                            await fetch("/api/support-alert", {
                                method: "POST",
                                body: JSON.stringify({
                                    type: "checkout_failure",
                                    userId: user.uid,
                                    userEmail: user.email,
                                    plan: userPlan
                                })
                            });
                        } catch {
                            console.error("Failed to send support alert");
                        }

                        setLoading(false);
                        return;
                    }
                    return; // Success - redirecting to checkout
                }
            }

            if (redirectPath) {
                router.push(redirectPath);
            } else {
                router.push(formData.role === "owner" ? "/dashboard" : "/search");
            }
        } catch (error) {
            console.error(error);
            toast.error("Failed to complete setup.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="w-full max-w-lg shadow-lg">
            <CardHeader>
                <div className="flex justify-between items-center mb-4">
                    <div className="text-sm font-medium text-muted-foreground">Step {step + 1} of 4</div>
                    <div className="flex gap-1">
                        {[0, 1, 2, 3].map((i) => (
                            <div key={i} className={`h-2 w-8 rounded-full transition-colors ${i <= step ? 'bg-primary' : 'bg-gray-200'}`} />
                        ))}
                    </div>
                </div>
                <CardTitle className="text-2xl">
                    {step === 0 && "Welcome! Who are you?"}
                    {step === 1 && (formData.role === "owner" ? "Restaurant Details" : "Dietary Restrictions")}
                    {step === 2 && (formData.role === "owner" ? "Almost Ready" : "Allergies & Intolerances")}
                    {step === 3 && (formData.role === "owner" ? "Ready to Go!" : "Preferences")}
                </CardTitle>
                <CardDescription>
                    {step === 0 && "Choose how you want to use NearSpotty."}
                    {step === 1 && (formData.role === "owner" ? "Tell us about your culinary gem." : "Select the dietary requirements you follow.")}
                    {step === 2 && (formData.role === "owner" ? "Finalize your business profile." : "List any allergies we should watch out for.")}
                    {step === 3 && (formData.role === "owner" ? "Verify your information before finishing." : "Customize your search experience.")}
                </CardDescription>
            </CardHeader>
            <CardContent className="min-h-[300px]">
                <AnimatePresence mode="wait">
                    {step === 0 && (
                        <motion.div
                            key="step0"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="grid grid-cols-2 gap-4"
                        >
                            <button
                                onClick={() => updateFormData("role", "diner")}
                                className={`flex flex-col items-center justify-center p-6 border-2 rounded-xl transition-all ${formData.role === "diner" ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-gray-100 hover:border-gray-200'}`}
                            >
                                <div className={`p-4 rounded-full mb-4 ${formData.role === "diner" ? 'bg-primary text-white' : 'bg-gray-100 text-gray-400'}`}>
                                    <UserIcon className="h-8 w-8" />
                                </div>
                                <span className="font-bold">I&apos;m a Diner</span>
                                <p className="text-xs text-center text-gray-500 mt-2">Find places that match your taste perfectly.</p>
                            </button>
                            <button
                                onClick={() => updateFormData("role", "owner")}
                                className={`flex flex-col items-center justify-center p-6 border-2 rounded-xl transition-all ${formData.role === "owner" ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-gray-100 hover:border-gray-200'}`}
                            >
                                <div className={`p-4 rounded-full mb-4 ${formData.role === "owner" ? 'bg-primary text-white' : 'bg-gray-100 text-gray-400'}`}>
                                    <Utensils className="h-8 w-8" />
                                </div>
                                <span className="font-bold">I&apos;m an Owner</span>
                                <p className="text-xs text-center text-gray-500 mt-2">Manage your restaurant and reservations.</p>
                            </button>
                        </motion.div>
                    )}

                    {step === 1 && (
                        <motion.div
                            key="step1"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-4"
                        >
                            {formData.role === "owner" ? (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="restaurantName">Restaurant Name</Label>
                                        <Input
                                            id="restaurantName"
                                            placeholder="The Golden Spoon"
                                            value={formData.restaurantName}
                                            onChange={(e) => updateFormData("restaurantName", e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="restaurantAddress">Address</Label>
                                        <Input
                                            id="restaurantAddress"
                                            placeholder="123 Foodie Street"
                                            value={formData.restaurantAddress}
                                            onChange={(e) => updateFormData("restaurantAddress", e.target.value)}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="city">City</Label>
                                            <Input
                                                id="city"
                                                placeholder="Bratislava"
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
                                                onChange={(e) => updateFormData("avgCheck", parseInt(e.target.value) || 0)}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Cuisine Types (select all that apply)</Label>
                                        <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 border rounded-lg bg-gray-50">
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
                                                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${isSelected
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
                                </div>
                            ) : (
                                DIETARY_OPTIONS.map((option) => (
                                    <div key={option.id} className="flex items-center space-x-2 border p-4 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer" onClick={() => {
                                        const current = formData.dietary;
                                        const included = current.includes(option.id);
                                        updateFormData("dietary", included ? current.filter(id => id !== option.id) : [...current, option.id]);
                                    }}>
                                        <Checkbox id={option.id} checked={formData.dietary.includes(option.id)} onCheckedChange={(checked) => {
                                            const current = formData.dietary;
                                            updateFormData("dietary", checked ? [...current, option.id] : current.filter(id => id !== option.id));
                                        }} />
                                        <Label htmlFor={option.id} className="flex-1 cursor-pointer font-medium">{option.label}</Label>
                                    </div>
                                ))
                            )}
                        </motion.div>
                    )}

                    {step === 2 && (
                        <motion.div
                            key="step2"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-4"
                        >
                            {formData.role === "owner" ? (
                                <div className="text-center py-8 space-y-4">
                                    <div className="h-16 w-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
                                        <Check className="h-8 w-8" />
                                    </div>
                                    <h3 className="text-xl font-bold">Great!</h3>
                                    <p className="text-gray-500">Your restaurant profile is being created. You&apos;ll be able to manage listing details in your dashboard.</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <Label htmlFor="allergies">Describe your allergies (comma separated)</Label>
                                    <Textarea
                                        id="allergies"
                                        placeholder="e.g. Peanuts, Shellfish, Soy..."
                                        className="min-h-[150px]"
                                        value={formData.allergies}
                                        onChange={(e) => updateFormData("allergies", e.target.value)}
                                    />
                                    <p className="text-sm text-gray-500">Our AI will specifically check reviews for mentions of these allergens.</p>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {step === 3 && (
                        <motion.div
                            key="step3"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-8"
                        >
                            {formData.role === "owner" ? (
                                <div className="space-y-4 border rounded-lg p-6 bg-gray-50">
                                    <h4 className="font-bold text-lg border-b pb-2">Business Summary</h4>
                                    <div className="grid grid-cols-2 gap-y-3 text-sm">
                                        <span className="text-gray-500">Name:</span>
                                        <span className="font-medium">{formData.restaurantName || "Not set"}</span>
                                        <span className="text-gray-500">Address:</span>
                                        <span className="font-medium">{formData.restaurantAddress || "Not set"}</span>
                                        <span className="text-gray-500">Plan:</span>
                                        <span className="font-medium text-primary">Business Free</span>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="space-y-4">
                                        <div className="flex justify-between">
                                            <Label>Search Radius</Label>
                                            <span className="text-sm font-medium text-primary">{formData.radius} km</span>
                                        </div>
                                        <Slider
                                            defaultValue={[formData.radius]}
                                            max={20}
                                            min={1}
                                            step={1}
                                            onValueChange={(val) => updateFormData("radius", val[0])}
                                        />
                                    </div>

                                    <div className="space-y-3">
                                        <Label>Favorite Cuisines</Label>
                                        <div className="flex flex-wrap gap-2">
                                            {CUISINE_OPTIONS.map((cuisine) => {
                                                const isSelected = formData.cuisines.includes(cuisine);
                                                return (
                                                    <div
                                                        key={cuisine}
                                                        onClick={() => {
                                                            const current = formData.cuisines;
                                                            updateFormData("cuisines", isSelected ? current.filter(c => c !== cuisine) : [...current, cuisine]);
                                                        }}
                                                        className={`px-3 py-1.5 rounded-full text-sm font-medium border cursor-pointer transition-colors ${isSelected ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                                                    >
                                                        {cuisine}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </CardContent>
            <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={handleBack} disabled={step === 0}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>

                {step < 3 ? (
                    <Button onClick={handleNext} disabled={step === 1 && formData.role === "owner" && (!formData.restaurantName || !formData.restaurantAddress)}>
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

export default function OnboardingPage() {
    return (
        <ProtectedRoute>
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
                <Toaster position="top-center" />
                <Suspense fallback={<div>Loading...</div>}>
                    <OnboardingForm />
                </Suspense>
            </div>
        </ProtectedRoute>
    );
}
