import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getAdminDb } from "@/lib/firebase-admin";

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

export async function POST(request: NextRequest) {
    try {
        const { placeId, cuisineType } = await request.json();

        if (!placeId) {
            return NextResponse.json({ error: "placeId is required" }, { status: 400 });
        }

        const db = getAdminDb();

        // Fetch recent reservations for this restaurant (last 90 days)
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        // Query with only placeId and date to avoid needing composite index
        // Filter by status in memory
        const reservationsSnapshot = await db
            .collection("reservations")
            .where("placeId", "==", placeId)
            .where("date", ">=", ninetyDaysAgo)
            .limit(200) // Increased limit since we'll filter in memory
            .get();

        // Collect unique user IDs from confirmed reservations only
        const userIds = new Set<string>();
        reservationsSnapshot.forEach((doc) => {
            const data = doc.data();
            // Filter for confirmed reservations in memory
            if (data.status === "confirmed" && data.userId && data.userId !== "anonymous") {
                userIds.add(data.userId);
            }
        });

        if (userIds.size === 0) {
            return NextResponse.json({
                suggestions: [],
                message: "Not enough customer data yet. AI recommendations will improve as you get more reservations.",
                customerCount: 0
            });
        }

        // Fetch user preferences for these customers
        const userPreferences: { dietary: string[]; cuisines: string[]; allergies: string[] } = {
            dietary: [],
            cuisines: [],
            allergies: []
        };

        const userPromises = Array.from(userIds).map(async (userId) => {
            try {
                const userDoc = await db.collection("users").doc(userId).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    const prefs = userData?.preferences || {};

                    if (prefs.dietary && Array.isArray(prefs.dietary)) {
                        userPreferences.dietary.push(...prefs.dietary);
                    }
                    if (prefs.cuisines && Array.isArray(prefs.cuisines)) {
                        userPreferences.cuisines.push(...prefs.cuisines);
                    }
                    if (prefs.allergies && typeof prefs.allergies === 'string') {
                        userPreferences.allergies.push(prefs.allergies);
                    }
                }
            } catch (error) {
                console.error(`Failed to fetch user ${userId}:`, error);
            }
        });

        await Promise.all(userPromises);

        // Aggregate preferences (count occurrences)
        const dietaryCounts = countOccurrences(userPreferences.dietary);
        const cuisineCounts = countOccurrences(userPreferences.cuisines);
        const allergenCounts = countOccurrences(userPreferences.allergies);

        // Get top preferences
        const topDietary = getTopItems(dietaryCounts, 5);
        const topCuisines = getTopItems(cuisineCounts, 5);
        const topAllergens = getTopItems(allergenCounts, 3);

        // Use Mock if no key
        if (!apiKey) {
            console.warn("No Gemini API Key found. Using mock suggestions.");
            return NextResponse.json({
                suggestions: [
                    "Add more vegetarian options to appeal to health-conscious diners",
                    "Consider gluten-free alternatives for pasta dishes",
                    "Expand vegan dessert selection"
                ],
                customerCount: userIds.size,
                insights: {
                    topDietary,
                    topCuisines,
                    topAllergens
                }
            });
        }

        const model = genAI.getGenerativeModel({
            model: "gemini-3-flash-preview",
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `You are an expert restaurant menu consultant analyzing customer preference data.

Restaurant Profile:
- Cuisine Type: ${cuisineType}
- Customer Base Size: ${userIds.size} regular customers

Customer Preference Analysis:
- Top Dietary Preferences: ${topDietary.map(d => `${d.item} (${d.count} customers)`).join(", ") || "None"}
- Top Cuisine Interests: ${topCuisines.map(c => `${c.item} (${c.count} customers)`).join(", ") || "General"}
- Common Allergens to Avoid: ${topAllergens.map(a => `${a.item} (${a.count} customers)`).join(", ") || "None"}

Based on this data, provide 3-5 actionable menu optimization suggestions that would:
1. Better serve the existing customer base
2. Increase customer satisfaction and repeat visits
3. Be practical to implement for a ${cuisineType} restaurant

Format your response as JSON:
{
    "suggestions": [
        "specific actionable suggestion 1",
        "specific actionable suggestion 2",
        ...
    ],
    "reasoning": "Brief explanation of why these suggestions matter for this restaurant"
}
`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const data = JSON.parse(text);

        return NextResponse.json({
            suggestions: data.suggestions,
            reasoning: data.reasoning,
            customerCount: userIds.size,
            insights: {
                topDietary,
                topCuisines,
                topAllergens
            }
        });

    } catch (error) {
        console.error("Menu AI Suggest Error:", error);
        return NextResponse.json({
            error: "Failed to generate menu suggestions",
            suggestions: []
        }, { status: 500 });
    }
}

// Helper functions
function countOccurrences(arr: string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    arr.forEach(item => {
        if (item) {
            counts[item] = (counts[item] || 0) + 1;
        }
    });
    return counts;
}

function getTopItems(counts: Record<string, number>, limit: number): { item: string; count: number }[] {
    return Object.entries(counts)
        .map(([item, count]) => ({ item, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}
