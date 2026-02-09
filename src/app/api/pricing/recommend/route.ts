import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

export async function POST(request: NextRequest) {
    try {
        const { location, cuisineType, avgCheckSize } = await request.json();

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

        const prompt = `You are an expert restaurant revenue manager.
        Analyze the following restaurant context:
        - Location: ${location}
        - Cuisine: ${cuisineType}
        - Average Check Size: €${avgCheckSize}

        Recommend an optimal reservation deposit amount (in EUR) to minimize no-shows while maintaining booking conversion.
        Provide the response in the following JSON format:
        {
            "recommendedDeposit": number,
            "reasoning": "string (short, max 2 sentences)",
            "projectedNoShowRate": number (percentage, e.g. 5.5),
            "projectedBookingRate": number (percentage, e.g. 85.0),
            "marketContext": {
                "similarCount": number (estimate number of similar venues analyzed)
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
