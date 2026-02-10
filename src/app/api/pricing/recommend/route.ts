import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

export async function POST(request: NextRequest) {
    try {
        const { location, cuisineType, avgCheckSize, seats, priceLevel } = await request.json();

        // Use Mock if no key (safe for CI/Dev without keys)
        if (!apiKey) {
            console.warn("No Gemini API Key found. Using mock data.");
            return NextResponse.json({
                recommendedDeposit: Math.round(avgCheckSize * 0.2), // 20% of check
                reasoning: "Standard deposit ratio for this price point to ensure commitment.",
                projectedNoShowRate: 4.5,
                projectedBookingRate: 92.0,
                marketContext: { similarCount: 15 }
            });
        }

        const model = genAI.getGenerativeModel({
            model: "gemini-3-flash-preview",
            generationConfig: { responseMimeType: "application/json" }
        });

        const priceLevelDesc = priceLevel === 4 ? "Very Expensive (€€€€)" : 
                              priceLevel === 3 ? "Expensive (€€€)" : 
                              priceLevel === 2 ? "Moderate (€€)" : "Inexpensive (€)";

        const prompt = `You are an expert restaurant revenue manager specializing in European dining markets.
        Analyze the following restaurant profile to recommend optimal reservation deposit strategy:
        
        Restaurant Profile:
        - Location: ${location}
        - Cuisine Type: ${cuisineType}
        - Average Check Size: €${avgCheckSize}
        - Seating Capacity: ${seats || 'Not specified'} seats
        - Price Category: ${priceLevelDesc} (Level ${priceLevel || 'Unknown'})

        Based on this specific restaurant's location (city/neighborhood market dynamics), cuisine type popularity, 
        price positioning, and capacity constraints, recommend an optimal reservation deposit amount (in EUR) 
        that will minimize no-shows while maintaining strong booking conversion rates.

        Consider:
        - Local market standards for this cuisine and price point
        - Competitive positioning based on price level
        - Capacity management (higher deposits justified for high-demand small venues)
        - Customer psychology (deposit should feel fair, not prohibitive)

        Provide the response in the following JSON format:
        {
            "recommendedDeposit": number,
            "reasoning": "string (2-3 sentences explaining why this deposit is optimal for THIS specific restaurant)",
            "projectedNoShowRate": number (percentage, e.g. 5.5),
            "projectedBookingRate": number (percentage, e.g. 85.0),
            "marketContext": {
                "similarCount": number (estimate number of similar venues in this market)
            }
        }
        `;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const data = JSON.parse(text);

        return NextResponse.json(data);

    } catch (error) {
        console.error("Gemini API Error:", error);
        // Fallback mock data if API fails
        return NextResponse.json({
            recommendedDeposit: 10,
            reasoning: "Optimization unavailable. Using standard market fallback.",
            projectedNoShowRate: 5.0,
            projectedBookingRate: 90.0,
            marketContext: { similarCount: 10 }
        });
    }
}
