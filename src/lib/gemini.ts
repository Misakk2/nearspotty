import { GoogleGenerativeAI } from "@google/generative-ai";
import { GeminiScore } from "@/types";

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" }); // Using Flash for speed

/**
 * Helper: Retry operation with exponential backoff
 */
async function retryOperation<T>(operation: () => Promise<T>, maxRetries: number = 3, delayMs: number = 1000): Promise<T> {
    let lastError: any;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error: any) {
            lastError = error;
            // Retry only on 503 (Overloaded) or 429 (Rate Limit) or network errors
            const isRetryable = error.status === 503 || error.status === 429 || error.message?.includes('fetch') || error.message?.includes('network');
            if (!isRetryable) throw error;

            console.warn(`[Gemini] Attempt ${i + 1} failed. Retrying in ${delayMs}ms...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            delayMs *= 2; // Exponential backoff
        }
    }
    throw lastError;
}

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
[{"matchScore": number, "shortReason": "string (max 10 words)", "recommendedDish": "string", "pros": ["string"], "cons": ["string"]}]
`;

    try {
        const result = await retryOperation(() => model.generateContent(prompt));
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
                pros: Array.isArray(raw.pros) ? raw.pros : [],
                cons: Array.isArray(raw.cons) ? raw.cons : [],
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

    // Prepare JSON Payload for Gemini (as requested)
    const placesPayload = places.map((p, i) => ({
        id: i + 1, // Use index as ID for mapping back
        name: p.name,
        types: p.types.slice(0, 3),
        rating: p.rating,
        summary: p.editorialSummary || "No summary",
        reviews: p.reviews?.map(r => {
            const text = typeof r.text === 'string' ? r.text : (r.text as any)?.text || "";
            return text.substring(0, 200); // Truncate for token limits
        }).slice(0, 5) || [], // Top 5 reviews
        vegetarian: p.servesVegetarianFood
    }));

    const prompt = `
Task: Analyze these restaurants against the specific User Profile.
User Profile: ${JSON.stringify(userProfile)}

Restaurants Data (JSON):
${JSON.stringify(placesPayload, null, 2)}

Strict Scoring Rules:
1. SAFETY FIRST: If a review mentions "cross-contamination", "got sick", "reaction", or explicit diet violation (e.g. "found meat" for vegan) -> Score MUST be < 50. Set "warning_flag": true.
2. RELEVANCE: If the place perfectly matches the query AND diet (e.g. "Dedicated GF" for Celiac) -> Score MUST be > 90.
3. If no relevant info found -> Score ~70-75 (Neutral).

Output Requirements:
- Return a JSON Array exactly matching the input list size and order.
- Each item: { "id": number, "matchScore": number (0-100), "shortReason": "string (max 15 words)", "warning_flag": boolean, "pros": ["string"], "cons": ["string"] }
- NO Markdown formatting. Just the raw JSON array.
`;

    try {
        const result = await retryOperation(() => model.generateContent(prompt));
        const response = await result.response;
        const text = response.text();
        const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
        let scores: any[] = [];

        try {
            scores = JSON.parse(jsonStr);
        } catch (e) {
            console.error("Failed to parse Gemini JSON output:", jsonStr);
            // Fallback: Try to find array bracket
            const start = jsonStr.indexOf('[');
            const end = jsonStr.lastIndexOf(']');
            if (start !== -1 && end !== -1) {
                scores = JSON.parse(jsonStr.substring(start, end + 1));
            }
        }

        const results = new Map<string, GeminiScore>();

        places.forEach((p, i) => {
            // Find score by ID (since we used index + 1) or index fallback
            const raw = scores.find((s: any) => s.id === i + 1) || scores[i] || {};

            results.set(p.place_id, {
                matchScore: typeof raw.matchScore === 'number' ? raw.matchScore : 70,
                shortReason: raw.shortReason || "AI analysis pending",
                recommendedDish: raw.recommendedDish || "",
                pros: Array.isArray(raw.pros) ? raw.pros : [],
                cons: Array.isArray(raw.cons) ? raw.cons : [],
                warnings: raw.warning_flag ? ["Potential dietary risk detected"] : [],
                warning: !!raw.warning_flag
            });
        });

        return results;
    } catch (error) {
        console.error("Gemini Deep Scoring Error:", error);
        return new Map();
    }
}
