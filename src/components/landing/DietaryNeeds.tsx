"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";

export const DietaryNeeds = ({ items }: { items: string[] }) => {
    return (
        <section className="py-24 bg-gray-50">
            <div className="container px-6 mx-auto text-center space-y-12">
                <h2 className="text-3xl font-bold tracking-tight">Whatever your diet, we&apos;ve got you covered.</h2>
                <div className="flex flex-wrap justify-center gap-4 max-w-4xl mx-auto">
                    {items.map((item, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, scale: 0.8 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.05 }}
                            whileHover={{ scale: 1.1, rotate: 2 }}
                        >
                            <Badge className="px-6 py-3 rounded-full text-lg font-bold bg-white text-gray-700 border border-gray-200 shadow-sm hover:border-primary hover:text-primary transition-all cursor-default">
                                {item}
                            </Badge>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};
