"use client";

import { Quote } from "lucide-react";
import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Sections";
import { ProblemSolution } from "@/components/landing/ProblemSolution";
import { PricingTable } from "@/components/landing/Marketing";
import { FAQ, CTASection } from "@/components/landing/FinalSections";
import { Footer } from "@/components/landing/Footer";

export default function ForRestaurantsPage() {
    const painPoints = [
        { icon: "closed", text: "Customers with dietary needs can't find you online" },
        { icon: "reading", text: "Your effort on gluten-free options is buried in review #47" },
        { icon: "hungry", text: "Late-night bookings are empty even though you're open" },
    ];

    const features = [
        { icon: "scoring", title: "Get Found by the Right Customers", description: "Appear when vegans search 'vegan restaurant near me at 10 PM'. AI scores YOUR menu high." },
        { icon: "availability", title: "AI Menu Optimization", description: "Gemini 3 analyzes reviews and suggests menu additions to boost bookings by up to 30%." },
        { icon: "recommendation", title: "Reservation Management", description: "See bookings, dietary notes, and analytics. Know what your customers need before they arrive." },
        { icon: "reservation", title: "Smart Pricing Recommendations", description: "AI suggests optimal deposit amounts to reduce no-shows without losing customers." },
    ];

    const pricingTiers = [
        {
            name: "Basic",
            price: "29",
            description: "Perfect for single-location cafes",
            features: [
                "Up to 50 reservations/month",
                "Restaurant profile",
                "Basic dietary tags",
                "Reservation calendar",
                "Email notifications",
                "€1.50 per-cover fee after limit"
            ],
            cta: "Start Free Trial",
            popular: false,
            link: "/signup?role=owner&plan=basic"
        },
        {
            name: "Pro",
            price: "79",
            description: "For growing restaurants",
            features: [
                "UNLIMITED reservations",
                "AI menu optimization insights",
                "Advanced analytics",
                "Customer dietary dashboard",
                "Email + SMS notifications",
                "€1.00 per-cover fee"
            ],
            cta: "Start Free Trial",
            popular: true,
            dynamicPricing: true,
            link: "/signup?role=owner&plan=pro"
        },
        {
            name: "Enterprise",
            price: "199",
            description: "Multi-location chains",
            features: [
                "Everything in Pro",
                "Multi-location management",
                "API access",
                "White-label booking widget",
                "Dedicated account manager",
                "Custom dietary categories",
                "€0.50 per-cover fee"
            ],
            cta: "Contact Sales",
            popular: false,
            dynamicPricing: true,
            link: "/signup?role=owner&plan=enterprise"
        }
    ];

    const faq = [
        { q: "How does NearSpotty find customers for my restaurant?", a: "We use AI to match your menu strengths with customers' dietary needs. If you have great gluten-free options, we ensure you appear first for those searching for them." },
        { q: "What is the per-cover fee?", a: "Depending on your plan, we charge a small fee per person for completed reservations. This helps us keep the subscription price competitive." },
        { q: "How does AI menu optimization work?", a: "Gemini 3 analyzes local market trends and customer search patterns to identify missing opportunities in your menu, like a lack of plant-based desserts." },
        { q: "Can I customize my dietary tags?", a: "Yes, you can specify exactly what your kitchen can handle, from certified gluten-free prep areas to specific allergy precautions." },
    ];

    return (
        <div className="flex min-h-screen flex-col">
            <main className="flex-1">
                <Hero
                    title={<>Turn Your Dietary-Friendly Menu Into <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-orange-400">Bookings</span></>}
                    subtitle="Join NearSpotty and connect with customers actively searching for vegan, gluten-free, kosher, and specialty diets. AI-powered insights. SaaS platform. More revenue."
                    primaryCTA="Claim Your Restaurant"
                    primaryLink="/signup?role=owner&redirect=/dashboard"
                    trustBadge="Used by 1000+ Restaurant Owners"
                />

                <ProblemSolution
                    title="Your Vegan Menu is Amazing. But Who Knows?"
                    painPoints={painPoints}
                    solution="NearSpotty surfaces your dietary strengths to 100M+ Europeans actively searching RIGHT NOW. No more empty tables."
                />

                <div id="features">
                    <Features title="Built to Fill Your Tables" features={features} />
                </div>

                <section id="pricing">
                    <div className="pt-24 pb-12 text-center">
                        <h2 className="text-4xl font-extrabold tracking-tight">Flexible Pricing for Every Business</h2>
                        <p className="text-gray-500 mt-4 max-w-2xl mx-auto">Start with a 14-day free trial. No credit card required. Cancel anytime.</p>
                    </div>
                    <PricingTable tiers={pricingTiers} />
                </section>

                <section className="py-24 bg-white">
                    <div className="container px-6 mx-auto">
                        <div className="max-w-4xl mx-auto p-12 rounded-[3rem] bg-gray-50 border border-gray-100 flex flex-col md:flex-row items-center gap-12">
                            <div className="flex-1 space-y-6">
                                <Quote className="h-12 w-12 text-primary/20" />
                                <p className="text-2xl font-medium leading-relaxed italic">
                                    &quot;NearSpotty connected us with customers we never reached before. Our revenue from vegan bookings is up 40% in just three months.&quot;
                                </p>
                                <div>
                                    <p className="font-bold">Veganská Reštaurácia</p>
                                    <p className="text-sm text-gray-500 underline">Bratislava, Slovakia</p>
                                </div>
                            </div>
                            <div className="flex-1 grid grid-cols-2 gap-4">
                                <div className="p-6 bg-white rounded-3xl shadow-sm text-center">
                                    <p className="text-3xl font-extrabold text-primary">+87</p>
                                    <p className="text-xs text-gray-500 font-bold uppercase mt-2">Bookings / Month</p>
                                </div>
                                <div className="p-6 bg-white rounded-3xl shadow-sm text-center">
                                    <p className="text-3xl font-extrabold text-green-500">73%</p>
                                    <p className="text-xs text-gray-500 font-bold uppercase mt-2">New Customers</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <FAQ questions={faq} />

                <CTASection
                    title="Ready to Grow Your Restaurant?"
                    cta="Claim Your Free Listing"
                    link="/signup?role=owner&redirect=/dashboard"
                    secondaryCTA="Contact Support"
                    secondaryLink="mailto:support@nearspotty.online"
                />
            </main>

            <Footer />
        </div>
    );
}
