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
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import toast, { Toaster } from "react-hot-toast";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

const DIETARY_OPTIONS = [
    { id: "vegan", label: "Vegan" },
    { id: "vegetarian", label: "Vegetarian" },
    { id: "paleo", label: "Paleo" },
    { id: "keto", label: "Keto" },
    { id: "gluten-free", label: "Gluten-Free" },
    { id: "lactose-free", label: "Lactose-Free" },
    { id: "kosher", label: "Kosher" },
    { id: "halal", label: "Halal" },
];

const CUISINE_OPTIONS = ["Italian", "Mexican", "Japanese", "Indian", "Chinese", "Thai", "American", "Mediterranean"];

/**
 * Diner Onboarding Flow
 * 
 * Step 1: Dietary Restrictions
 * Step 2: Allergies & Intolerances
 * Step 3: Preferences (Cuisines, Radius, Budget)
 */
function OnboardingForm() {
    const { user, userRole } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirectPath = searchParams.get("redirect");

    const [step, setStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        dietary: [] as string[],
        allergies: "",
        cuisines: [] as string[],
        radius: 5,
        budget: "any" as 'low' | 'medium' | 'high' | 'any',
    });

    const updateFormData = (field: string, value: string | string[] | number) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const handleNext = () => setStep((prev) => Math.min(prev + 1, 2));
    const handleBack = () => setStep((prev) => Math.max(prev - 1, 0));

    // Check if user already completed onboarding
    useEffect(() => {
        if (!user) return;

        const checkOnboarding = async () => {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const data = userDoc.data();

                // If already completed onboarding, redirect
                if (data.preferences?.completedOnboarding && userRole && userRole !== "no_role" && userRole !== "error") {
                    const role = data.role;
                    console.log(`[Onboarding] User already onboarded. Redirecting to ${role} dashboard`);
                    router.push(role === "owner" ? "/dashboard" : "/search");
                }
            }
        };
        checkOnboarding();
    }, [user, router, userRole]);

    const handleSubmit = async () => {
        if (!user) return;
        setLoading(true);

        try {
            await setDoc(doc(db, "users", user.uid), {
                role: "diner",
                preferences: {
                    dietary: formData.dietary,
                    allergies: formData.allergies,
                    cuisines: formData.cuisines,
                    radius: formData.radius,
                    budget: formData.budget,
                    completedOnboarding: true
                },
            }, { merge: true });

            toast.success("Onboarding completed! 🎉");

            // Redirect
            if (redirectPath) {
                router.push(redirectPath);
            } else {
                router.push("/search");
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
                    <div className="text-sm font-medium text-muted-foreground">Step {step + 1} of 3</div>
                    <div className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className={`h-2 w-8 rounded-full transition-colors ${i <= step ? 'bg-primary' : 'bg-gray-200'}`} />
                        ))}
                    </div>
                </div>
                <CardTitle className="text-2xl">
                    {step === 0 && "Dietary Restrictions"}
                    {step === 1 && "Allergies & Intolerances"}
                    {step === 2 && "Preferences"}
                </CardTitle>
                <CardDescription>
                    {step === 0 && "Select the dietary requirements you follow."}
                    {step === 1 && "List any allergies we should watch out for."}
                    {step === 2 && "Customize your search experience."}
                </CardDescription>
            </CardHeader>
            <CardContent className="min-h-[300px]">
                <AnimatePresence mode="wait">
                    {/* Step 0: Dietary Restrictions */}
                    {step === 0 && (
                        <motion.div
                            key="step0"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-4"
                        >
                            {DIETARY_OPTIONS.map((option) => (
                                <div
                                    key={option.id}
                                    className="flex items-center space-x-2 border p-4 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                                    onClick={() => {
                                        const current = formData.dietary;
                                        const included = current.includes(option.id);
                                        updateFormData("dietary", included ? current.filter(id => id !== option.id) : [...current, option.id]);
                                    }}
                                >
                                    <Checkbox
                                        id={option.id}
                                        checked={formData.dietary.includes(option.id)}
                                        onCheckedChange={(checked) => {
                                            const current = formData.dietary;
                                            updateFormData("dietary", checked ? [...current, option.id] : current.filter(id => id !== option.id));
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                    <span className="flex-1 cursor-pointer font-medium">{option.label}</span>
                                </div>
                            ))}
                        </motion.div>
                    )}

                    {/* Step 1: Allergies */}
                    {step === 1 && (
                        <motion.div
                            key="step1"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-4"
                        >
                            <div className="space-y-2">
                                <Textarea
                                    id="allergies"
                                    placeholder="e.g. Peanuts, Shellfish, Soy..."
                                    className="min-h-[150px]"
                                    value={formData.allergies}
                                    onChange={(e) => updateFormData("allergies", e.target.value)}
                                />
                                <p className="text-sm text-gray-500">Our AI will specifically check reviews for mentions of these allergens.</p>
                            </div>
                        </motion.div>
                    )}

                    {/* Step 2: Preferences */}
                    {step === 2 && (
                        <motion.div
                            key="step2"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-8"
                        >
                            <div className="space-y-4">
                                <div className="flex justify-between">
                                    <span className="font-medium">Search Radius</span>
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
                                <span className="font-medium">Favorite Cuisines</span>
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

                            <div className="space-y-3">
                                <span className="font-medium">Budget Preference</span>
                                <div className="flex flex-wrap gap-2">
                                    {(['any', 'low', 'medium', 'high'] as const).map((budgetOption) => {
                                        const isSelected = formData.budget === budgetOption;
                                        const labels = {
                                            any: '💰 Any',
                                            low: '€ Budget',
                                            medium: '€€ Mid-range',
                                            high: '€€€ Fine dining'
                                        };
                                        return (
                                            <div
                                                key={budgetOption}
                                                onClick={() => updateFormData("budget", budgetOption)}
                                                className={`px-3 py-1.5 rounded-full text-sm font-medium border cursor-pointer transition-colors ${isSelected ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                                            >
                                                {labels[budgetOption]}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </CardContent>
            <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={handleBack} disabled={step === 0}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>

                {step < 2 ? (
                    <Button onClick={handleNext}>
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
