import Link from "next/link";
import { Utensils, Instagram, Facebook, Twitter } from "lucide-react";

export const Footer = () => {
    return (
        <footer className="bg-gray-50 border-t pt-20 pb-10">
            <div className="container px-6 mx-auto">
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-12 mb-16">
                    <div className="col-span-2 lg:col-span-2 space-y-6">
                        <div className="flex items-center gap-2">
                            <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center">
                                <Utensils className="h-5 w-5 text-white" />
                            </div>
                            <span className="font-bold text-xl tracking-tight">NearSpotty</span>
                        </div>
                        <p className="text-muted-foreground text-sm max-w-xs">
                            AI-powered restaurant discovery for every dietary need. Find safe, delicious meals matched to you.
                        </p>
                        <div className="flex gap-4">
                            <Link href="#" className="h-10 w-10 rounded-full bg-white border flex items-center justify-center hover:text-primary transition-colors transition-shadow hover:shadow-md">
                                <Instagram className="h-5 w-5" />
                            </Link>
                            <Link href="#" className="h-10 w-10 rounded-full bg-white border flex items-center justify-center hover:text-primary transition-colors transition-shadow hover:shadow-md">
                                <Facebook className="h-5 w-5" />
                            </Link>
                            <Link href="#" className="h-10 w-10 rounded-full bg-white border flex items-center justify-center hover:text-primary transition-colors transition-shadow hover:shadow-md">
                                <Twitter className="h-5 w-5" />
                            </Link>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="font-bold text-sm uppercase tracking-widest">Platform</h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li><Link href="#how-it-works" className="hover:text-primary transition-colors">How it Works</Link></li>
                            <li><Link href="/search" className="hover:text-primary transition-colors">Search Map</Link></li>
                            <li><Link href="/signup" className="hover:text-primary transition-colors">Diner Sign Up</Link></li>
                        </ul>
                    </div>

                    <div className="space-y-4">
                        <h4 className="font-bold text-sm uppercase tracking-widest">Business</h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li><Link href="/for-restaurants" className="hover:text-primary transition-colors">NearSpotty for Restaurants</Link></li>
                            <li><Link href="/restaurant/claim" className="hover:text-primary transition-colors">Claim Listing</Link></li>
                            <li><Link href="/for-restaurants" className="hover:text-primary transition-colors">Pricing</Link></li>
                        </ul>
                    </div>

                    <div className="space-y-4">
                        <h4 className="font-bold text-sm uppercase tracking-widest">Legal</h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li><Link href="#" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
                            <li><Link href="#" className="hover:text-primary transition-colors">Terms of Service</Link></li>
                            <li><Link href="#" className="hover:text-primary transition-colors">Cookies</Link></li>
                        </ul>
                    </div>
                </div>

                <div className="border-t pt-8 text-center md:text-left flex flex-col md:flex-row justify-between items-center gap-4">
                    <p className="text-xs text-muted-foreground">
                        © 2026 NearSpotty • Powered by Gemini 3 AI
                    </p>
                    <div className="flex gap-4 text-xs font-medium uppercase tracking-tighter text-muted-foreground">
                        <span>Built with ❤️ for every diet</span>
                    </div>
                </div>
            </div>
        </footer>
    );
};
