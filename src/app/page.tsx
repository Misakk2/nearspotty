import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Utensils, Search, CheckCircle } from "lucide-react";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="px-6 h-16 flex items-center justify-between border-b sticky top-0 bg-background/95 backdrop-blur z-50">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center">
            <Utensils className="h-5 w-5 text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight">NearSpotty</span>
        </div>
        <nav className="hidden md:flex gap-6">
          <Link href="#how-it-works" className="text-sm font-medium hover:text-primary transition-colors">
            How it Works
          </Link>
          <Link href="/signin" className="text-sm font-medium hover:text-primary transition-colors">
            For Restaurants
          </Link>
        </nav>
        <div className="flex gap-4">
          <Link href="/login">
            <Button variant="ghost" className="font-semibold">Log in</Button>
          </Link>
          <Link href="/signup">
            <Button className="font-semibold shadow-lg shadow-primary/20">Sign up</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-24 lg:py-32 px-6 text-center space-y-8 max-w-5xl mx-auto">
          <div className="space-y-4">
            <h1 className="text-4xl md:text-6xl font-bold tracking-tighter sm:text-5xl bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 pb-2">
              Find your perfect meal,<br />
              <span className="text-primary">matched to your diet.</span>
            </h1>
            <p className="mx-auto max-w-[700px] text-gray-500 md:text-xl dark:text-gray-400">
              AI-powered restaurant finder that matches you with nearby spots based on your dietary preferences. Vegan, Gluten-free, Halal—we&apos;ve got you covered.
            </p>
          </div>
          <div className="flex justify-center gap-4">
            <Link href="/signup">
              <Button size="lg" className="h-12 px-8 text-lg shadow-xl shadow-primary/25 hover:shadow-primary/40 transition-all rounded-full">
                Get Started
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="#demo">
              <Button variant="outline" size="lg" className="h-12 px-8 text-lg rounded-full">
                View Demo
              </Button>
            </Link>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="py-24 bg-gray-50 dark:bg-gray-900/50">
          <div className="container px-6 mx-auto">
            <div className="text-center mb-16 space-y-2">
              <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl">How It Works</h2>
              <p className="text-gray-500 md:text-lg">Discover safe and delicious dining in 3 simple steps.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {/* Step 1 */}
              <div className="bg-background p-8 rounded-2xl shadow-sm border space-y-4 relative group hover:shadow-md transition-shadow">
                <div className="absolute -top-6 left-8 bg-background border p-3 rounded-xl shadow-sm">
                  <CheckCircle className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-bold pt-4">1. set Preferences</h3>
                <p className="text-gray-500">Tell us your dietary needs—Vegan, Gluten-free, Allergies. We customize results just for you.</p>
              </div>

              {/* Step 2 */}
              <div className="bg-background p-8 rounded-2xl shadow-sm border space-y-4 relative group hover:shadow-md transition-shadow">
                <div className="absolute -top-6 left-8 bg-background border p-3 rounded-xl shadow-sm">
                  <Search className="h-8 w-8 text-secondary" />
                </div>
                <h3 className="text-xl font-bold pt-4">2. Find Places</h3>
                <p className="text-gray-500">Search nearby restaurants. Our AI analyzes reviews to find the safest matches.</p>
              </div>

              {/* Step 3 */}
              <div className="bg-background p-8 rounded-2xl shadow-sm border space-y-4 relative group hover:shadow-md transition-shadow">
                <div className="absolute -top-6 left-8 bg-background border p-3 rounded-xl shadow-sm">
                  <Utensils className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-bold pt-4">3. Eat Confidence</h3>
                <p className="text-gray-500">View dietary scores and recommended dishes. Book a table and enjoy your meal.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-12 bg-background">
        <div className="container px-6 mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-sm text-gray-500">© 2024 NearSpotty. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="#" className="text-sm text-gray-500 hover:text-foreground">Privacy</Link>
            <Link href="#" className="text-sm text-gray-500 hover:text-foreground">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
