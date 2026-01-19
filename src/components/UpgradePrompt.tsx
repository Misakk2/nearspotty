"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Sparkles, Zap, X } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

interface UpgradePromptProps {
    isOpen: boolean;
    onClose: () => void;
    type: "ai_limit" | "reservation_limit";
    remainingCount?: number;
    planName?: string;
}

export function UpgradePrompt({ isOpen, onClose, type, remainingCount = 0, planName = "Free" }: UpgradePromptProps) {
    const content = {
        ai_limit: {
            title: "AI Check Limit Reached",
            description: `You've used all ${remainingCount === 0 ? "5" : remainingCount} AI restaurant checks this month on the ${planName} plan.`,
            benefit: "Upgrade to Premium for unlimited AI-powered restaurant analysis!",
            cta: "Upgrade to Premium",
            link: "/subscription",
        },
        reservation_limit: {
            title: "Reservation Limit Reached",
            description: `You've reached your monthly reservation limit on the ${planName} plan.`,
            benefit: "Upgrade to Pro for unlimited reservations and AI insights!",
            cta: "Upgrade Your Plan",
            link: "/subscription",
        },
    };

    const current = content[type];

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Card className="w-full max-w-md border-2 border-primary/20 shadow-2xl">
                            <CardHeader className="relative pb-2">
                                <button
                                    onClick={onClose}
                                    className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100 transition-colors"
                                >
                                    <X className="h-5 w-5 text-gray-400" />
                                </button>
                                <div className="h-14 w-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
                                    <Sparkles className="h-7 w-7 text-primary" />
                                </div>
                                <CardTitle className="text-xl">{current.title}</CardTitle>
                                <CardDescription className="text-base">
                                    {current.description}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="bg-gradient-to-r from-primary/5 to-orange-500/5 rounded-xl p-4 border border-primary/10">
                                    <div className="flex items-start gap-3">
                                        <Zap className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                                        <p className="text-sm font-medium text-gray-700">
                                            {current.benefit}
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="flex flex-col gap-3">
                                <Link href={current.link} className="w-full">
                                    <Button className="w-full h-12 text-lg font-bold shadow-lg">
                                        {current.cta}
                                    </Button>
                                </Link>
                                <Button variant="ghost" onClick={onClose} className="w-full">
                                    Maybe Later
                                </Button>
                            </CardFooter>
                        </Card>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

// Simpler inline banner version for non-blocking prompts
export function UpgradeBanner({ type, remainingCount }: { type: "ai_limit" | "reservation_limit"; remainingCount: number }) {
    if (remainingCount > 3) return null; // Only show when getting low

    const isAI = type === "ai_limit";

    return (
        <div className="bg-gradient-to-r from-primary/10 to-orange-500/10 border border-primary/20 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-primary/20 rounded-lg flex items-center justify-center">
                        <Sparkles className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <p className="font-bold text-sm">
                            {remainingCount === 0
                                ? `No ${isAI ? "AI checks" : "reservations"} remaining`
                                : `Only ${remainingCount} ${isAI ? "AI checks" : "reservations"} left this month`
                            }
                        </p>
                        <p className="text-xs text-gray-500">
                            Upgrade for unlimited access
                        </p>
                    </div>
                </div>
                <Link href="/subscription">
                    <Button size="sm" className="font-bold">
                        Upgrade
                    </Button>
                </Link>
            </div>
        </div>
    );
}
