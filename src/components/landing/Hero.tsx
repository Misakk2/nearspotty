"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export const Hero = ({
    title,
    subtitle,
    primaryCTA,
    secondaryCTA,
    primaryLink,
    secondaryLink,
    trustBadge
}: {
    title: React.ReactNode;
    subtitle: string;
    primaryCTA: string;
    secondaryCTA?: string;
    primaryLink: string;
    secondaryLink?: string;
    trustBadge?: string;
}) => {
    return (
        <section className="relative pt-24 pb-16 lg:pt-32 lg:pb-24 overflow-hidden">
            {/* Background Gradients */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] -z-10 bg-[radial-gradient(circle_at_top,rgba(255,108,61,0.08),transparent_50%)]" />
            <div className="container px-6 mx-auto relative">
                <div className="max-w-4xl mx-auto text-center space-y-8">
                    {trustBadge && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5 }}
                        >
                            <Badge variant="outline" className="px-4 py-1.5 rounded-full bg-white/50 backdrop-blur-sm border-primary/20 text-primary font-medium animate-pulse">
                                {trustBadge}
                            </Badge>
                        </motion.div>
                    )}

                    <motion.h1
                        className="text-5xl md:text-7xl font-extrabold tracking-tight"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                    >
                        {title}
                    </motion.h1>

                    <motion.p
                        className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                    >
                        {subtitle}
                    </motion.p>

                    <motion.div
                        className="flex flex-wrap justify-center gap-4 pt-4"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.3 }}
                    >
                        <Link href={primaryLink}>
                            <Button size="lg" className="h-14 px-8 text-lg font-bold rounded-full shadow-2xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all">
                                {primaryCTA}
                                <ArrowRight className="ml-2 h-5 w-5" />
                            </Button>
                        </Link>
                        {secondaryCTA && secondaryLink && (
                            <Link href={secondaryLink}>
                                <Button size="lg" variant="outline" className="h-14 px-8 text-lg font-bold rounded-full hover:bg-white/80 backdrop-blur-sm transition-all">
                                    {secondaryCTA}
                                </Button>
                            </Link>
                        )}
                    </motion.div>
                </div>

                {/* Mockup Placeholder */}
                <motion.div
                    className="mt-16 relative max-w-5xl mx-auto"
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.4 }}
                >
                    <div className="aspect-[16/9] rounded-3xl bg-gradient-to-tr from-gray-100 to-gray-50 border p-2 shadow-2xl">
                        <div className="w-full h-full rounded-2xl bg-white overflow-hidden relative">
                            {/* Simplified App Mockup */}
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-64 h-[400px] border-8 border-gray-900 rounded-[3rem] shadow-2xl overflow-hidden bg-gray-50 relative">
                                    <div className="p-4 space-y-4">
                                        <div className="h-4 w-2/3 bg-gray-200 rounded animate-pulse" />
                                        <div className="aspect-video bg-primary/10 rounded-xl relative">
                                            <div className="absolute bottom-2 right-2 bg-white px-2 py-1 rounded-full text-[10px] font-bold text-primary flex items-center shadow-sm">
                                                <Sparkles className="h-3 w-3 mr-1 fill-primary" />
                                                4.8/5
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="h-3 w-full bg-gray-100 rounded" />
                                            <div className="h-3 w-5/6 bg-gray-100 rounded" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="absolute top-0 right-0 p-8 w-1/3 space-y-4 hidden md:block">
                                <div className="p-4 bg-white/80 backdrop-blur rounded-2xl border shadow-lg space-y-2 translate-x-12 translate-y-12">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-green-500" />
                                        <span className="text-[10px] font-bold uppercase text-gray-400">Perfect Match</span>
                                    </div>
                                    <p className="text-sm font-bold">Vegan Burger</p>
                                    <p className="text-xs text-gray-500">Review: &quot;Safest place for nut allergies in Prague!&quot;</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </section>
    );
};
