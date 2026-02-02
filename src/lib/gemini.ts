import { GoogleGenerativeAI } from "@google/generative-ai";
import { GeminiScore } from "@/types";

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" }); // Using Flash for speed

export interface PlaceForScoring {
    place_id: string;
    name: string;
    types: string[];
    rating?: number;
    price_level?: number;
    vicinity?: string;
}

export interface ScoredPlace extends PlaceForScoring {
    ai_score?: GeminiScore;
}

export interface PlaceWithContext extends PlaceForScoring {
    editorialSummary?: string;
    reviews?: { text: string; rating: number; flag?: "SAFE_CANDIDATE" | "RISK" }[];
    websiteUri?: string;
    servesVegetarianFood?: boolean;
}

/**
 * Scores a list of places based on user profile using Gemini.
 */
export async function scorePlacesWithGemini(
    places: PlaceForScoring[],
    userProfile: any
): Promise<Map<string, GeminiScore>> {
    if (!places.length) return new Map();

    const placesInfo = places.map((p, i) =>
        `${i + 1}. "${p.name}" (${p.types.slice(0, 2).join(',')}) | Rat:${p.rating || '-'} | Price:${p.price_level || '-'}`
    ).join('\n');

    const prompt = `
Task: Score these ${places.length} restaurants (0-100) for this user:
Profile: ${JSON.stringify(userProfile)}

Restaurants:
${placesInfo}

Rules:
- Score based on safety, dietary fit, and quality.
- Return a JSON Array matching the input order.
- NO markdown.

Output Schema:
[{"matchScore": number, "shortReason": "string (max 10 words)", "recommendedDish": "string"}]
`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
        const scores = JSON.parse(jsonStr);

        const results = new Map<string, GeminiScore>();

        places.forEach((p, i) => {
            const raw = scores[i] || {};
            results.set(p.place_id, {
                matchScore: raw.matchScore || 50,
                shortReason: raw.shortReason || "Analysis unavailable",
                recommendedDish: raw.recommendedDish || "",
                pros: [],
                cons: [],
                warnings: []
            });
        });

        return results;
    } catch (error) {
        console.error("Gemini Scoring Error:", error);
        return new Map();
    }
}

/**
 * Advanced Scoring with Deep Context (Reviews, Summary).
 */
export async function scorePlacesWithDeepContext(
    places: PlaceWithContext[],
    userProfile: any
): Promise<Map<string, GeminiScore>> {
    if (!places.length) return new Map();

    const placesInfo = places.map((p, i) =>
        `ID: ${i + 1}
Name: "${p.name}" (${p.types.slice(0, 2).join(',')})
Rating: ${p.rating || '-'}
Summary: ${p.editorialSummary || "N/A"}
Vegetarian Options: ${p.servesVegetarianFood ? "Yes" : "Unknown"}
Sample Reviews:
${p.reviews?.map(r => {
            // Safety check: Ensure text exists and is a string
            const reviewText = typeof r.text === 'string'
                ? r.text
                : (typeof r.text === 'object' && r.text !== null && 'text' in r.text ? (r.text as any).text : "");

            if (!reviewText) return ""; // Skip empty reviews

            return `- [${r.flag || "NEUTRAL"}] "${reviewText.substring(0, 150)}..."`;
        }).filter(Boolean).join('\n') || "No reviews provided."}
`
    ).join('\n---\n');

    const prompt = `
Role: Dietary Concierge.
User Profile: ${JSON.stringify(userProfile)}

Task: Analyze these restaurants. Score 0-100 on SAFETY and VIBE match.
Focus on: Dietary safety (allergies), vibe (budget/atmosphere), and review sentiment.
Input reviews already have pre-calculated flags [SAFE_CANDIDATE] or [RISK]. Trust these flags heavily for safety scoring.

Restaurants to Analyze:
${placesInfo}

Output Requirements:
- Return strictly a JSON Array of objects.
- Order must match input list.
- Schema: [{"matchScore": number, "shortReason": "string (max 15 words)", "recommendedDish": "string (guess from context)", "warnings": ["string"]}]
- NO Markdown.
`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
        const scores = JSON.parse(jsonStr);

        const results = new Map<string, GeminiScore>();

        places.forEach((p, i) => {
            const raw = scores[i] || {};
            results.set(p.place_id, {
                matchScore: typeof raw.matchScore === 'number' ? raw.matchScore : 50,
                shortReason: raw.shortReason || "Analysis unavailable",
                recommendedDish: raw.recommendedDish || "",
                pros: [],
                cons: [],
                warnings: Array.isArray(raw.warnings) ? raw.warnings : []
            });
        });

        return results;
    } catch (error) {
        console.error("Gemini Deep Scoring Error:", error);
        return new Map();
    }
}
