"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/auth-provider";
import ProtectedRoute from "@/components/protected-route";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import toast, { Toaster } from "react-hot-toast";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

const DIETARY_OPTIONS = [
    { id: "vegan", label: "Vegan" },
    { id: "vegetarian", label: "Vegetarian" },
    { id: "gluten-free", label: "Gluten-Free" },
    { id: "lactose-free", label: "Lactose-Free" },
    { id: "kosher", label: "Kosher" },
    { id: "halal", label: "Halal" },
];

const CUISINE_OPTIONS = ["Italian", "Mexican", "Japanese", "Indian", "Chinese", "Thai", "American", "Mediterranean"];

export default function OnboardingPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        dietary: [] as string[],
        allergies: "",
        cuisines: [] as string[],
        radius: 5,
    });

    const updateFormData = (field: string, value: string | string[] | number) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const handleNext = () => setStep((prev) => Math.min(prev + 1, 3));
    const handleBack = () => setStep((prev) => Math.max(prev - 1, 1));

    const handleSubmit = async () => {
        if (!user) return;
        setLoading(true);
        try {
            await setDoc(doc(db, "users", user.uid), {
                preferences: {
                    ...formData,
                    completedOnboarding: true
                }
            }, { merge: true });

            toast.success("Preferences saved!");
            router.push("/search"); // Redirect to search after onboarding
        } catch (error) {
            console.error(error);
            toast.error("Failed to save preferences.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <ProtectedRoute>
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
                <Toaster position="top-center" />
                <Card className="w-full max-w-lg shadow-lg">
                    <CardHeader>
                        <div className="flex justify-between items-center mb-4">
                            <div className="text-sm font-medium text-muted-foreground">Step {step} of 3</div>
                            <div className="flex gap-1">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className={`h-2 w-8 rounded-full transition-colors ${i <= step ? 'bg-primary' : 'bg-gray-200'}`} />
                                ))}
                            </div>
                        </div>
                        <CardTitle className="text-2xl">
                            {step === 1 && "Dietary Restrictions"}
                            {step === 2 && "Allergies & Intolerances"}
                            {step === 3 && "Preferences"}
                        </CardTitle>
                        <CardDescription>
                            {step === 1 && "Select the dietary requirements you follow."}
                            {step === 2 && "List any allergies we should watch out for."}
                            {step === 3 && "Customize your search experience."}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="min-h-[300px]">
                        <AnimatePresence mode="wait">
                            {step === 1 && (
                                <motion.div
                                    key="step1"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="space-y-4"
                                >
                                    {DIETARY_OPTIONS.map((option) => (
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
                                    ))}
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
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </CardContent>
                    <CardFooter className="flex justify-between">
                        <Button variant="outline" onClick={handleBack} disabled={step === 1}>
                            <ArrowLeft className="mr-2 h-4 w-4" /> Back
                        </Button>

                        {step < 3 ? (
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
            </div>
        </ProtectedRoute>
    );
}
