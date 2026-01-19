"use client";

import { motion } from "framer-motion";
import { AlertTriangle, SearchX, Frown, Sparkles } from "lucide-react";

export const ProblemSolution = ({ title, painPoints, solution }: { title: string; painPoints: { icon: string; text: string }[]; solution: string }) => {
    const getIcon = (type: string) => {
        switch (type) {
            case "closed": return <SearchX className="h-8 w-8 text-red-500" />;
            case "reading": return <AlertTriangle className="h-8 w-8 text-orange-500" />;
            case "hungry": return <Frown className="h-8 w-8 text-gray-500" />;
            default: return <AlertTriangle className="h-8 w-8 text-primary" />;
        }
    };

    return (
        <section className="py-24 bg-white relative overflow-hidden">
            {/* Background blobs */}
            <div className="absolute top-1/4 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
            <div className="absolute bottom-1/4 left-0 w-64 h-64 bg-secondary/5 rounded-full blur-3xl" />

            <div className="container px-6 mx-auto relative z-10">
                <div className="max-w-4xl mx-auto text-center space-y-16">
                    <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>

                    <div className="grid md:grid-cols-3 gap-8">
                        {painPoints.map((point, i) => (
                            <motion.div
                                key={i}
                                className="p-8 rounded-3xl bg-gray-50 border border-gray-100 space-y-4"
                                initial={{ opacity: 0, x: -20 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                            >
                                <div className="h-16 w-16 rounded-2xl bg-white shadow-sm flex items-center justify-center mx-auto">
                                    {getIcon(point.icon)}
                                </div>
                                <p className="font-medium text-gray-700 leading-relaxed italic">&quot;{point.text}&quot;</p>
                            </motion.div>
                        ))}
                    </div>

                    <motion.div
                        className="p-1 px-1 bg-gradient-to-r from-primary to-secondary rounded-[2rem] shadow-2xl"
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                    >
                        <div className="bg-white rounded-[1.9rem] p-10 md:p-14 space-y-6">
                            <div className="flex justify-center mb-6">
                                <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center">
                                    <Sparkles className="h-8 w-8 text-primary animate-pulse" />
                                </div>
                            </div>
                            <p className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                                {solution}
                            </p>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
};
