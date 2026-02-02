"use client";

import { useState, useEffect } from "react";
import { Loader2, Sparkles, MapPin, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const LOADING_MESSAGES = [
    { text: "Analyzing restaurant reviews...", icon: Search },
    { text: "Checking opening hours...", icon: MapPin },
    { text: "Finding hidden gems...", icon: Sparkles },
    { text: "Comparing dietary options...", icon: UtensilsCrossed }, // Need to import or replace
    { text: "Calculating best matches...", icon: Loader2 }
];

import { UtensilsCrossed } from "lucide-react";

export const CommunicativeLoader = () => {
    const [index, setIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    const CurrentIcon = LOADING_MESSAGES[index].icon;

    return (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="relative">
                <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
                <div className="bg-white p-3 rounded-full shadow-lg border border-primary/10 relative z-10">
                    <Loader2 className="h-8 w-8 text-primary animate-spin" />
                </div>
            </div>

            <div className="h-8 relative w-64 text-center">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.3 }}
                        className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground absolute inset-0"
                    >
                        <CurrentIcon className="h-4 w-4" />
                        <span>{LOADING_MESSAGES[index].text}</span>
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
};
