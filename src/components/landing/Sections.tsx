"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Utensils, CalendarCheck, Sparkles, Brain, Clock, ShieldCheck } from "lucide-react";

const fadeIn = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { delay: i * 0.1, duration: 0.5 }
    })
};

export const HowItWorks = ({ steps }: { steps: { title: string; subtitle: string; icon: "checklist" | "sparkle" | "calendar" }[] }) => {
    const getIcon = (type: string) => {
        switch (type) {
            case "checklist": return <CheckCircle2 className="h-10 w-10 text-primary" />;
            case "sparkle": return <Sparkles className="h-10 w-10 text-secondary" />;
            case "calendar": return <CalendarCheck className="h-10 w-10 text-primary" />;
            default: return <Utensils className="h-10 w-10" />;
        }
    };

    return (
        <section id="how-it-works" className="py-24 bg-white">
            <div className="container px-6 mx-auto">
                <div className="text-center mb-16">
                    <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">How it Works</h2>
                </div>
                <div className="grid md:grid-cols-3 gap-12 max-w-5xl mx-auto">
                    {steps.map((step, i) => (
                        <motion.div
                            key={i}
                            className="text-center space-y-4"
                            variants={fadeIn}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true }}
                            custom={i}
                        >
                            <div className="h-20 w-20 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto shadow-sm border border-gray-100 mb-6">
                                {getIcon(step.icon)}
                            </div>
                            <h3 className="text-xl font-bold">{step.title}</h3>
                            <p className="text-muted-foreground">{step.subtitle}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export const Features = ({ title, features }: { title: string; features: { icon: string; title: string; description: string }[] }) => {
    const getIcon = (type: string) => {
        switch (type) {
            case "scoring": return <Brain className="h-8 w-8 text-primary" />;
            case "availability": return <Clock className="h-8 w-8 text-secondary" />;
            case "recommendation": return <Sparkles className="h-8 w-8 text-primary" />;
            case "reservation": return <CalendarCheck className="h-8 w-8 text-secondary" />;
            default: return <ShieldCheck className="h-8 w-8 text-primary" />;
        }
    };

    return (
        <section className="py-24 bg-gray-50">
            <div className="container px-6 mx-auto">
                <div className="text-center mb-16">
                    <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
                    {features.map((feature, i) => (
                        <motion.div
                            key={i}
                            className="p-8 rounded-3xl bg-white border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300 group"
                            variants={fadeIn}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true }}
                            custom={i}
                        >
                            <div className="mb-6 p-3 rounded-2xl bg-gray-50 w-fit group-hover:scale-110 transition-transform">
                                {getIcon(feature.icon)}
                            </div>
                            <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                            <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};
