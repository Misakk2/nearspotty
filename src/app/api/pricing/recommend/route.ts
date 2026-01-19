import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "");

export async function POST(req: Request) {
    try {
        const { location, cuisineType, avgCheckSize } = await req.json();

        // Mock market data (In production, this would come from Firestore/Analytics)
        const marketData = {
            noShowRates: { "€0": 25, "€5": 18, "€10": 12, "€15": 8 },
            bookingRates: { "€0": 100, "€5": 97, "€10": 92, "€15": 85 },
            similarCount: 847
        };

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

        const prompt = `
            Analyze restaurant pricing data for:
            Location: ${location}
            Cuisine: ${cuisineType}
            Average Check Size: €${avgCheckSize}

            Historical No-show rates by deposit:
            €0 deposit: 25% no-show rate
            €5 deposit: 18% no-show rate
            €10 deposit: 12% no-show rate
            €15 deposit: 8% no-show rate

            Booking completion rates (customer willingness to pay):
            €0: 100% completion
            €5: 97% completion
            €10: 92% completion
            €15: 85% completion

            Task: Recommend an optimal deposit amount that balances reducing no-shows with maintaining high booking volume.
            Consider the average check size (€${avgCheckSize}) to ensure the deposit isn't disproportionately high.
            
            Respond strictly in JSON format with:
            { "recommendedDeposit": number, "reasoning": string, "projectedNoShowRate": number, "projectedBookingRate": number }
        `;

        const result = await model.generateContent(prompt);
        const response = result.response.text();

        // Extract JSON from response (handling potential markdown formatting)
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        const recommendation = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

        if (!recommendation) {
            throw new Error("Failed to parse AI recommendation");
        }

        return NextResponse.json({
            ...recommendation,
            marketContext: marketData
        });
    } catch (error) {
        console.error("Pricing API Error:", error);
        const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
