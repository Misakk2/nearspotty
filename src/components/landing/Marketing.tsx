"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Star, Check, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Testimonials = ({ testimonials }: { testimonials: { quote: string; author: string }[] }) => {
    return (
        <section className="py-24 bg-white overflow-hidden">
            <div className="container px-6 mx-auto">
                <h2 className="text-3xl font-bold text-center mb-16">What Our Community Says</h2>
                <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                    {testimonials.map((t, i) => (
                        <motion.div
                            key={i}
                            className="p-8 rounded-3xl border bg-gray-50/50 backdrop-blur-sm relative"
                            initial={{ opacity: 0, scale: 0.95 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.1 }}
                        >
                            <div className="flex gap-1 mb-4">
                                {[...Array(5)].map((_, j) => (
                                    <Star key={j} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                ))}
                            </div>
                            <p className="text-lg italic mb-6 leading-relaxed">&quot;{t.quote}&quot;</p>
                            <p className="font-bold text-sm text-primary uppercase tracking-wider">{t.author}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export const PricingTable = ({ tiers }: { tiers: { name: string; price: string; description: string; features: string[]; cta: string; popular: boolean; dynamicPricing?: boolean; link?: string }[] }) => {
    return (
        <section className="py-24 bg-gray-50">
            <div className="container px-6 mx-auto">
                <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                    {tiers.map((tier, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.1 }}
                            className="flex"
                        >
                            <Card className={`flex flex-col w-full rounded-3xl overflow-hidden border-2 transition-all hover:shadow-2xl ${tier.popular ? 'border-primary ring-4 ring-primary/5' : 'border-transparent shadow-lg'}`}>
                                {tier.popular && (
                                    <div className="bg-primary text-white text-center py-2 text-xs font-bold uppercase tracking-widest">
                                        Best Value
                                    </div>
                                )}
                                <CardHeader className="p-8 pb-0">
                                    <CardTitle className="text-2xl font-bold">{tier.name}</CardTitle>
                                    <CardDescription className="text-base mt-2">{tier.description}</CardDescription>
                                    <div className="pt-6">
                                        <span className="text-4xl font-extrabold font-mono">€{tier.price}</span>
                                        <span className="text-muted-foreground ml-1">/month</span>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-8 flex-1">
                                    <ul className="space-y-4">
                                        {tier.features.map((feature: string, j: number) => (
                                            <li key={j} className="flex items-start gap-3">
                                                <Check className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                                                <span className="text-sm font-medium">{feature}</span>
                                            </li>
                                        ))}
                                        {tier.dynamicPricing && (
                                            <li className="flex items-start gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10">
                                                <Zap className="h-5 w-5 text-primary shrink-0 mt-0.5 fill-primary/20" />
                                                <div className="space-y-1">
                                                    <span className="text-sm font-bold text-primary">Smart Pricing Optimization</span>
                                                    <p className="text-[10px] text-gray-500 leading-tight">Gemini 3 powered dynamic deposit recommendations</p>
                                                </div>
                                            </li>
                                        )}
                                    </ul>
                                </CardContent>
                                <CardFooter className="p-8 pt-0">
                                    {tier.link ? (
                                        <Link href={tier.link} className="w-full">
                                            <Button variant={tier.popular ? 'default' : 'outline'} className={`w-full h-12 rounded-full font-bold text-lg ${tier.popular ? 'shadow-xl shadow-primary/20' : ''}`}>
                                                {tier.cta}
                                            </Button>
                                        </Link>
                                    ) : (
                                        <Button variant={tier.popular ? 'default' : 'outline'} className={`w-full h-12 rounded-full font-bold text-lg ${tier.popular ? 'shadow-xl shadow-primary/20' : ''}`}>
                                            {tier.cta}
                                        </Button>
                                    )}
                                </CardFooter>
                            </Card>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};
