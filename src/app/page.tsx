import { Hero } from "@/components/landing/Hero";
import { HowItWorks, Features } from "@/components/landing/Sections";
import { ProblemSolution } from "@/components/landing/ProblemSolution";
import { DietaryNeeds } from "@/components/landing/DietaryNeeds";
import { Testimonials } from "@/components/landing/Marketing";
import { CTASection } from "@/components/landing/FinalSections";
import { Footer } from "@/components/landing/Footer";
import { getTranslation } from "@/lib/i18n-server";

export default async function Home() {
  const { t } = await getTranslation();

  const steps = (t("landing.steps") as { title: string; subtitle: string }[]).map((step, i) => ({
    ...step,
    icon: ["checklist", "sparkle", "calendar"][i] as "checklist" | "sparkle" | "calendar"
  }));

  const painPoints = [
    { icon: "closed", text: "Scrolling through 50 closed restaurants at 10 PM" },
    { icon: "reading", text: "Reading 200 reviews to find 'maybe vegan-friendly'" },
    { icon: "hungry", text: "Arriving hungry, leaving disappointed" },
  ];

  const features = [
    { icon: "scoring", title: "Smart Dietary Scoring", description: "AI reads reviews like a friend. 'They modified my pasta for allergies' = 4.8/5 safety score." },
    { icon: "availability", title: "Real-Time Availability", description: "Only see restaurants open NOW. No more closed kitchen surprises." },
    { icon: "recommendation", title: "Personalized Dish Recommendations", description: "Gemini 3 suggests: 'Try the quinoa burger – reviewers with your diet loved it.'" },
    { icon: "reservation", title: "One-Tap Reservations", description: "Book your table in 10 seconds. Confirmation email instant." },
  ];

  const diets = ["Vegan", "Vegetarian", "Lactose-Free", "Gluten-Free", "Kosher", "Halal", "Nut Allergies", "Keto", "Paleo"];

  const testimonials = [
    { quote: "Finally! An app that gets my dietary restrictions. Found a perfect vegan spot in 30 seconds.", author: "Sarah K., Prague" },
    { quote: "Traveling for business with celiac disease was stressful. NearSpotty shows me safe options instantly.", author: "Marco L., Bratislava" },
    { quote: "As a restaurant owner, NearSpotty connects us with customers actively looking for our kosher menu.", author: "David R., Vienna" },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1">
        <Hero
          title={<>{t("landing.hero_title") as string} <br /><span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-orange-400">{t("landing.hero_title_accent") as string}</span></>}
          subtitle={t("landing.hero_subtitle") as string}
          primaryCTA={t("landing.hero_cta_primary") as string}
          primaryLink="/signup?redirect=/search"
          secondaryCTA={t("landing.hero_cta_secondary") as string}
          secondaryLink="/for-restaurants"
          trustBadge={t("landing.hero_trust") as string}
        />

        <HowItWorks steps={steps} />

        <ProblemSolution
          title="Tired of Guessing If You Can Eat There?"
          painPoints={painPoints}
          solution="NearSpotty uses Gemini 3 AI to do the work for you. Only see places that fit your diet, are open right now, and have dishes you'll love."
        />

        <Features title="Powered by Advanced AI Intelligence" features={features} />

        <DietaryNeeds items={diets} />

        <Testimonials testimonials={testimonials} />

        <section className="py-24 bg-white border-y">
          <div className="container px-6 mx-auto">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-12 text-center">
              <div className="space-y-2">
                <p className="text-4xl md:text-5xl font-extrabold text-primary">100M+</p>
                <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">Diners in Europe</p>
              </div>
              <div className="space-y-2">
                <p className="text-4xl md:text-5xl font-extrabold text-gray-900">50%</p>
                <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">Check Reviews First</p>
              </div>
              <div className="space-y-2">
                <p className="text-4xl md:text-5xl font-extrabold text-gray-900">2.5h</p>
                <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">Average Time Wasted</p>
              </div>
              <div className="space-y-2">
                <p className="text-4xl md:text-5xl font-extrabold text-gray-900">87%</p>
                <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">Report Dining Anxiety</p>
              </div>
            </div>
          </div>
        </section>

        <CTASection
          title="Ready to End Dining Stress?"
          cta="Start Finding Restaurants"
          link="/signup"
          secondaryCTA="Get More Bookings"
          secondaryLink="/for-restaurants"
        />
      </main>

      <Footer />
    </div>
  );
}
