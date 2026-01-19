"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Brain, Info, TrendingDown, TrendingUp } from "lucide-react";
import toast from "react-hot-toast";

interface PricingRecommendation {
    recommendedDeposit: number;
    reasoning: string;
    projectedNoShowRate: number;
    projectedBookingRate: number;
    marketContext: {
        similarCount: number;
    };
}

export default function PricingSettings({
    location,
    cuisine,
    avgCheck
}: {
    location: string;
    cuisine: string;
    avgCheck: number
}) {
    const [loading, setLoading] = useState(false);
    const [recommendation, setRecommendation] = useState<PricingRecommendation | null>(null);
    const [userDeposit, setUserDeposit] = useState(0);

    const fetchRecommendation = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/pricing/recommend", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ location, cuisineType: cuisine, avgCheckSize: avgCheck })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setRecommendation(data);
            setUserDeposit(data.recommendedDeposit);
        } catch (error) {
            console.error("Pricing API Error:", error);
            toast.error("Failed to get pricing recommendation");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const load = async () => {
            await fetchRecommendation();
        };
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location, cuisine, avgCheck]);

    if (!recommendation && !loading) return null;

    // Simplified logic for live feedback simulation
    const getProjectedStats = (val: number) => {
        const noShow = Math.max(5, 25 - (val * 1.5));
        const booking = Math.min(100, 105 - (val * 1.2));
        return { noShow, booking };
    };

    const stats = getProjectedStats(userDeposit);

    return (
        <Card className="border-2 border-primary/20 shadow-xl overflow-hidden bg-gradient-to-b from-white to-primary/5">
            <CardHeader className="bg-primary text-white p-6">
                <div className="flex justify-between items-start">
                    <div className="space-y-1">
                        <CardTitle className="text-2xl font-bold flex items-center gap-2">
                            <Brain className="h-6 w-6" />
                            Smart Pricing Recommendation
                        </CardTitle>
                        <CardDescription className="text-primary-foreground/80 font-medium">
                            AI-driven deposit optimization for {location}
                        </CardDescription>
                    </div>
                    <Badge variant="secondary" className="bg-white/20 text-white border-white/30 animate-pulse">
                        <Sparkles className="h-3 w-3 mr-1 fill-white" />
                        Gemini 3 Powered
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
                {loading ? (
                    <div className="h-64 flex flex-col items-center justify-center gap-4 text-primary">
                        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                        <p className="font-bold animate-pulse">Analyzing market trends...</p>
                    </div>
                ) : (
                    <>
                        <div className="grid md:grid-cols-2 gap-8">
                            <div className="space-y-6">
                                <div className="p-4 bg-white rounded-2xl border-2 border-primary/10 space-y-2">
                                    <div className="flex items-center gap-2 text-primary font-bold">
                                        <Info className="h-4 w-4" />
                                        AI Reasoning
                                    </div>
                                    <p className="text-sm text-gray-600 leading-relaxed italic">
                                        &quot;{recommendation?.reasoning}&quot;
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between">
                                        <label className="font-bold text-sm text-gray-700">Custom Deposit Amount</label>
                                        <span className="text-2xl font-extrabold text-primary">€{userDeposit}</span>
                                    </div>
                                    <Slider
                                        value={[userDeposit]}
                                        max={30}
                                        step={1}
                                        onValueChange={(v) => setUserDeposit(v[0])}
                                        className="py-4"
                                    />
                                    <p className="text-[10px] text-gray-400 font-medium text-center uppercase tracking-widest">
                                        Average check size for your area: €{avgCheck}
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                <div className="p-6 bg-white rounded-3xl border shadow-sm space-y-2 group hover:border-primary/50 transition-colors">
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-500 font-bold text-xs uppercase">Est. No-Show Rate</span>
                                        <TrendingDown className="h-4 w-4 text-green-500" />
                                    </div>
                                    <p className="text-4xl font-extrabold text-gray-900">{stats.noShow.toFixed(1)}%</p>
                                    <p className="text-xs text-green-600 font-bold">Reduced by AI optimization</p>
                                </div>
                                <div className="p-6 bg-white rounded-3xl border shadow-sm space-y-2 group hover:border-primary/50 transition-colors">
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-500 font-bold text-xs uppercase">Booking Acceptance</span>
                                        <TrendingUp className="h-4 w-4 text-blue-500" />
                                    </div>
                                    <p className="text-4xl font-extrabold text-gray-900">{stats.booking.toFixed(1)}%</p>
                                    <p className="text-xs text-blue-600 font-bold">Projected conversion rate</p>
                                </div>
                            </div>
                        </div>

                        <div className="pt-6 border-t flex justify-between items-center">
                            <p className="text-xs text-gray-400 italic">
                                Based on data from {recommendation?.marketContext.similarCount} similar restaurants in {location}.
                            </p>
                            <Button className="rounded-full px-8 font-bold shadow-lg">
                                Apply Strategy
                            </Button>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
