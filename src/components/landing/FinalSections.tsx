"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

export const FAQ = ({ questions }: { questions: { q: string; a: string }[] }) => {
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    return (
        <section className="py-24 bg-white">
            <div className="container px-6 mx-auto max-w-3xl">
                <h2 className="text-3xl font-bold text-center mb-16">Frequently Asked Questions</h2>
                <div className="space-y-4">
                    {questions.map((item, i) => (
                        <div key={i} className="border border-gray-100 rounded-2xl overflow-hidden shadow-sm transition-all">
                            <button
                                className="w-full p-6 text-left flex justify-between items-center hover:bg-gray-50 transition-colors"
                                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                            >
                                <span className="font-bold text-lg">{item.q}</span>
                                <ChevronDown className={`h-5 w-5 transition-transform duration-300 ${openIndex === i ? 'rotate-180' : ''}`} />
                            </button>
                            <motion.div
                                initial={false}
                                animate={{ height: openIndex === i ? 'auto' : 0 }}
                                className="overflow-hidden"
                            >
                                <div className="p-6 pt-0 text-gray-600 leading-relaxed border-t border-gray-50">
                                    {item.a}
                                </div>
                            </motion.div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export const CTASection = ({ title, cta, link, secondaryCTA, secondaryLink }: { title: string; cta: string; link: string; secondaryCTA?: string; secondaryLink?: string }) => {
    return (
        <section className="py-24 px-6">
            <div className="container mx-auto">
                <motion.div
                    className="bg-primary rounded-[3rem] p-12 md:p-20 text-center text-white relative overflow-hidden shadow-2xl"
                    initial={{ opacity: 0, scale: 0.95 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                >
                    {/* Decorative Circles */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full translate-x-1/2 -translate-y-1/2" />
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary-foreground/5 rounded-full -translate-x-1/2 translate-y-1/2" />

                    <div className="relative z-10 max-w-3xl mx-auto space-y-8">
                        <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight">
                            {title}
                        </h2>
                        <div className="flex flex-wrap justify-center gap-4">
                            <Link href={link}>
                                <Button size="lg" className="h-14 px-10 text-lg font-bold rounded-full bg-white text-primary hover:bg-gray-100 transition-all shadow-xl">
                                    {cta}
                                </Button>
                            </Link>
                            {secondaryCTA && secondaryLink && (
                                <Link href={secondaryLink}>
                                    <Button size="lg" className="h-14 px-10 text-lg font-bold rounded-full bg-white/20 border-2 border-white/40 text-white hover:bg-white/30 transition-all backdrop-blur-sm">
                                        {secondaryCTA}
                                    </Button>
                                </Link>
                            )}
                        </div>
                    </div>
                </motion.div>
            </div>
        </section>
    );
};
