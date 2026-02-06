/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GeminiScore } from "@/types";
import { GeminiResponseSchema, type StrictGeminiScore } from "@/lib/gemini-schema";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
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

// =============================================================================
// STAGE 2: LIGHTWEIGHT SCOUT (Dietary-Aware Filtering)
// =============================================================================

/**
 * Light candidate from Stage 1 discovery (minimal fields)
 */
export interface LightCandidate {
    place_id: string;
    name: string;
    types: string[];
    rating?: number;
    userRatingCount?: number;
    location: { lat: number; lng: number };
    distance?: number; // Haversine distance in meters
}

interface UserDietaryProfile {
    allergies?: string[];
    dietary?: string[];    // e.g., ["vegan", "vegetarian"]
    cuisines?: string[];
    hasSuperlative?: boolean;
}

/**
 * Scout Result: Distinguishes between perfect matches and survival (compromise) options
 */
export interface ScoutResult {
    /** IDs of places that perfectly match dietary requirements */
    perfectMatches: string[];
    /** Single best compromise if no perfect matches exist */
    survivalOption?: {
        id: string;
        reason: string; // e.g., "Italian - likely veggie pasta options"
    };
    /** True if only survival option available (no perfect matches) */
    isSurvivalMode: boolean;
}

/**
 * AI Scout: Selects top N candidates from 20 light candidates.
 * Performs dietary-aware filtering with "Survival Mode" for compromises.
 * 
 * @param lightCandidates - 20 candidates with light fields
 * @param keyword - Search keyword (e.g., "pizza")
 * @param userProfile - User dietary preferences for filtering
 * @returns ScoutResult with perfectMatches or survivalOption
 */
export async function scoutTopCandidates(
    lightCandidates: LightCandidate[],
    keyword: string,
    userProfile: UserDietaryProfile
): Promise<ScoutResult> {
    const emptyResult: ScoutResult = { perfectMatches: [], isSurvivalMode: false };
    if (!lightCandidates.length) return emptyResult;

    // If less than or equal to 6 candidates and no dietary restrictions, return all as perfect
    const hasDietaryRestrictions = (userProfile.dietary?.length ?? 0) > 0 || (userProfile.allergies?.length ?? 0) > 0;
    if (lightCandidates.length <= 6 && !hasDietaryRestrictions) {
        console.log(`[Scout] Only ${lightCandidates.length} candidates, no restrictions, returning all.`);
        return { perfectMatches: lightCandidates.map(c => c.place_id), isSurvivalMode: false };
    }

    const hasSuperlative = userProfile.hasSuperlative === true;
    const isVegan = userProfile.dietary?.some(d => d.toLowerCase().includes('vegan')) ?? false;
    const isVegetarian = userProfile.dietary?.some(d => d.toLowerCase().includes('vegetarian')) ?? false;
    const isGlutenFree = userProfile.allergies?.some(a => a.toLowerCase().includes('gluten')) ?? false;
    const allergies = userProfile.allergies || [];

    const candidatesPayload = lightCandidates.map((c, i) => ({
        idx: i + 1,
        id: c.place_id,
        name: c.name,
        types: c.types.slice(0, 5),
        rating: c.rating || "N/A",
        reviews: c.userRatingCount || 0,
        dist: c.distance ? `${Math.round(c.distance)}m` : "unknown"
    }));

    const scoutPrompt = `
You are an AI SCOUT selecting restaurants for a user. Be PRAGMATIC, not strict.

# USER CONTEXT
- Search Query: "${keyword}"
- Quality Mode: ${hasSuperlative ? 'EXCELLENCE REQUESTED (prioritize rating >= 4.5)' : 'Standard'}
- Dietary: ${isVegan ? 'VEGAN' : isVegetarian ? 'VEGETARIAN' : 'None'}
- Gluten-Free: ${isGlutenFree ? 'YES' : 'No'}
- Other Allergies: ${allergies.filter(a => !a.toLowerCase().includes('gluten')).join(', ') || 'None'}

# PRAGMATIC MATCHING RULES
**IMPORTANT: Be generous, not strict.**

A place is a **MATCH** if the user can eat a satisfying meal there:
${isVegan ? `
VEGAN - These are ALL MATCHES (not survival):
- Italian (Pizza Marinara, pasta pomodoro, bruschetta, risotto exist)
- Asian/Thai/Vietnamese/Chinese (tofu dishes, vegetable stir-fry, noodles)
- Indian (dal, vegetable curry, samosas, naan without ghee)
- Mexican (bean tacos, veggie burritos, guacamole)
- Mediterranean (falafel, hummus, tabbouleh, salads)
- Middle Eastern (falafel, mezze, grilled vegetables)
- Ethiopian (injera with vegetable stews)
- Salad bars, Juice bars, Cafes with veggie options
` : ''}
${isVegetarian ? `
VEGETARIAN - These are ALL MATCHES (not survival):
- Any restaurant with pasta, pizza, rice dishes, salads
- Italian, Asian, Indian, Mexican, Mediterranean
- Cafes, Bakeries, Brunch spots
` : ''}
${isGlutenFree ? `
GLUTEN-FREE - These are ALL MATCHES (not survival):
- Sushi/Japanese (rice-based, sashimi)
- Mexican (corn tortillas, rice, beans)
- Vietnamese (pho, rice noodles)
- Thai (rice dishes, pad thai with rice noodles)
- Steakhouses (meat + potatoes)
- Seafood restaurants
` : ''}

# SURVIVAL MODE (Only for TRULY incompatible places)
Reserve "Survival" ONLY when user would struggle to find a main course:
${isVegan ? `
VEGAN SURVIVAL (severely limited):
- Steakhouse, BBQ, Grill House (maybe side salad only)
- Butcher shop, Burger joint with no veggie burger
- Seafood-only restaurants
` : ''}
${isVegetarian ? `
VEGETARIAN SURVIVAL (severely limited):
- Steakhouse focused only on meat
- BBQ pit with no veggie sides
` : ''}
${isGlutenFree ? `
GLUTEN-FREE SURVIVAL (severely limited):
- Bakery (high cross-contamination)
- Pizza-only place (no GF crust)
- Sandwich-only shop
- Pasta-focused Italian (if no GF options)
` : ''}

# CANDIDATES
${JSON.stringify(candidatesPayload, null, 2)}

# OUTPUT FORMAT (JSON only, no markdown)
{
  "perfectMatches": ["id1", "id2", ...],
  "survivalOption": { "id": "id_of_compromise", "reason": "Short explanation" },
  "isSurvivalMode": false
}

RULES:
- MOST places should be matches. Be pragmatic, not strict.
- Italian pizzeria = MATCH for vegan (Pizza Marinara exists).
- Only flag as "Survival" if the place is genuinely hostile to the diet.
- If perfectMatches has 1+ results, set isSurvivalMode: false and survivalOption: null
- If perfectMatches is empty, set isSurvivalMode: true and provide ONE survivalOption
- If NO dietary restrictions exist, return top 6 by rating as perfectMatches
`;

    try {
        const result = await retryOperation(() => model.generateContent(scoutPrompt));
        const response = await result.response;
        const text = response.text();

        // Clean and parse
        const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
        const parsed = JSON.parse(jsonStr) as ScoutResult;

        // Validate: ensure all IDs exist in candidates
        const validIds = new Set(lightCandidates.map(c => c.place_id));
        const validPerfect = parsed.perfectMatches.filter(id => validIds.has(id)).slice(0, 6);

        const scoutResult: ScoutResult = {
            perfectMatches: validPerfect,
            isSurvivalMode: validPerfect.length === 0 && !!parsed.survivalOption,
            survivalOption: parsed.survivalOption && validIds.has(parsed.survivalOption.id)
                ? parsed.survivalOption
                : undefined
        };

        console.log(`[Scout] Result: ${scoutResult.perfectMatches.length} perfect, survival=${scoutResult.isSurvivalMode}`);
        if (scoutResult.survivalOption) {
            console.log(`[Scout] Survival: ${scoutResult.survivalOption.id} (${scoutResult.survivalOption.reason})`);
        }

        return scoutResult;

    } catch (error) {
        console.error("[Scout] AI selection failed, falling back to rating sort:", error);

        // Fallback: Sort by rating and take top 6 as "perfect" matches
        const fallback = [...lightCandidates]
            .sort((a, b) => (b.rating || 0) - (a.rating || 0))
            .slice(0, 6)
            .map(c => c.place_id);

        return { perfectMatches: fallback, isSurvivalMode: false };
    }
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
 * Generates a friendly "No Exact Match" discovery message in Slovak.
 */
export async function generateDiscoveryMessage(
    keyword: string,
    availableCategories: string[],
    userProfile: any
): Promise<string> {
    const prompt = `
    Role: Friendly local guide "Nearspotty".
    Language: Strictly English.
    Situation: User searched for "${keyword}" but we found NO exact matches nearby.
    Available places have these categories: ${availableCategories.join(', ')}.
    User Profile: ${JSON.stringify(userProfile)}

    Task: Write a short, helpful message (max 2 sentences).
    1. Acknowledge we couldn't find specific "${keyword}".
    2. Suggest an alternative from available categories based on user profile OR suggest increasing radius.
    3. Be distinct but polite.

    Example output: "We couldn't find any ${keyword} nearby, but based on your love for Asian cuisine, you might enjoy these Thai alternatives."
    `;

    try {
        const result = await retryOperation(() => model.generateContent(prompt));
        return result.response.text();
    } catch (e) {
        console.error("Discovery Message Error:", e);
        return `We couldn't find any "${keyword}" in this area. Try increasing the search radius or look for other businesses nearby.`;
    }
}

/**
 * Strict Concierge System Instruction
 * Enforces safety-first analysis with hard allergy exclusion
 */
const STRICT_SYSTEM_INSTRUCTION = `
You are a STRICT CONCIERGE analyzing restaurants for users with dietary restrictions and allergies.

# CRITICAL RULES (HIGHEST PRIORITY)

## 1. SAFETY ANALYSIS (MANDATORY FIRST STEP)
For each restaurant:
1. Check restaurant NAME, TYPES, and SUMMARY for allergy triggers
2. If ANY of the following match USER ALLERGIES:
   - Restaurant name contains allergen (e.g., "The Peanut House" + Nut allergy)
   - Primary cuisine is allergen-heavy (e.g., "Cheese Bar" + Dairy allergy)
   - Reviews mention allergen as specialty (e.g., "Famous for peanut sauce")
   
   → SET safetyFlag: true
   → SET matchScore: 0
   → SET relevanceScore: 0
   → SET shortReason: "SAFETY RISK: {allergen} detected in {location}"
   → STOP ANALYSIS for this place

## 2. DIETARY ALIGNMENT (SECOND PRIORITY)
If user is VEGAN:
- Prioritize places with "vegan", "plant-based", "dairy-free" in name/reviews
- Score 80-100: Explicitly vegan or many vegan options mentioned
- Score 40-80: Has some vegan options
- Score 0-40: Steakhouse, dairy-focused, or no vegan mentions

If user is VEGETARIAN:
- Same logic but allow dairy/eggs
- Penalize meat-focused places heavily

If user is GLUTEN-FREE:
- Prioritize places with "gluten-free" menu mentions
- Penalize bakeries, pasta specialists heavily

## 3. QUERY RELEVANCE (THIRD PRIORITY)
User searched for: "{query}"

- EXACT MATCH (90-100): Name contains "{query}" or primary type is "{query}"
- HIGH MATCH (70-90): Serves "{query}" as mentioned in reviews/types
- MISMATCH (0-40): Different cuisine entirely (e.g., searched "Sushi" → "Mexican")

## 4. QUALITY EXPECTATIONS (SUPERLATIVE HANDLING)
If the user's raw query contains quality superlatives like:
- English: "best", "amazing", "incredible", "fantastic", "top tier", "perfect", "outstanding"
- Slovak: "najlepšia", "úžasná", "skvelá", "perfektná", "výborná"

THEN apply STRICT QUALITY FILTERING:
- HEAVILY PENALIZE restaurants with rating BELOW 4.5 (-30 to -50 points)
- Prioritize "High Quality" over "Proximity" for ranking
- Set matchScore CEILING at 70 for places with rating < 4.0
- Reward places with 100+ reviews AND rating >= 4.5 (+15 bonus)

## PRO/CON QUALITY RULES (CRITICAL)
Generate SPECIFIC, HARD-HITTING Pros/Cons based on reviews and facts:
- NEVER use generic phrases: "Good food", "Nice atmosphere", "Friendly staff", "Great service"
- ALWAYS be specific and data-driven:
  ✅ Good examples: "Loud acoustics (60+ dB)", "30min avg wait time", "Authentic wood-fired oven", "Cash only", "No vegetarian mains", "Limited parking", "Runs out of specials by 8pm"
  ❌ Bad examples: "Tasty dishes", "Cozy ambiance", "Delicious food", "Pleasant experience"
- Base Pros/Cons on REVIEW CONTENT and FACTUAL data, not assumptions
- Include specific times, prices, or quantities when available

## OUTPUT FORMAT
Return JSON Array (NO MARKDOWN, NO CODE BLOCKS):
[
  {
    "id": "place_id",
    "relevanceScore": 0-100,
    "matchScore": 0-100,
    "safetyFlag": true or false,
    "shortReason": "string (max 15 words)",
    "recommendedDish": "string or empty",
    "pros": ["string"],
    "cons": ["string"],
    "warnings": ["string"] or []
  }
]

# LANGUAGE: English only
# TONE: Direct, safety-focused, concise
`;

/**
 * Build strict personalization prompt
 */
function buildStrictPrompt(
    places: PlaceWithContext[],
    userProfile: any,
    query: string
): string {
    const placesPayload = places.map((p) => ({
        id: p.place_id,
        name: p.name,
        types: p.types.slice(0, 3),
        rating: p.rating,
        summary: p.editorialSummary || "No summary",
        reviews: p.reviews?.slice(0, 3).map(r => {
            const text = typeof r.text === 'string' ? r.text : (r.text as any)?.text || "";
            return text.substring(0, 150);
        }) || []
    }));

    // Extract allergies and dietary preferences safely
    const allergies = Array.isArray(userProfile.allergies)
        ? userProfile.allergies
        : (userProfile.allergies ? [userProfile.allergies] : []);

    const dietary = Array.isArray(userProfile.dietary)
        ? userProfile.dietary
        : [];

    // Extract superlative and raw query context
    const hasSuperlative = userProfile.hasSuperlative === true;
    const rawQuery = userProfile.rawQuery || query;

    return `
${STRICT_SYSTEM_INSTRUCTION.replace('{query}', query)}

# USER PROFILE
- Allergies: ${allergies.length > 0 ? allergies.join(', ') : 'None'}
- Dietary: ${dietary.length > 0 ? dietary.join(', ') : 'None'}
- Budget: ${userProfile.budget || 'any'}
- Preferred Cuisines: ${Array.isArray(userProfile.cuisines) ? userProfile.cuisines.join(', ') : 'Any'}

# RAW USER QUERY
"${rawQuery}"

# QUALITY MODE
${hasSuperlative ? '⚠️ USER REQUESTED EXCELLENCE: The query contains superlatives like "best", "amazing", "najlepšia". APPLY STRICT QUALITY FILTERING as per section 4.' : 'Standard mode - balance quality with relevance.'}

# RESTAURANTS TO ANALYZE
${JSON.stringify(placesPayload, null, 2)}

Analyze each restaurant and return the JSON array.
`;
}

/**
 * Filter and rank scored places (post-processing)
 */
function filterSafeResults(
    scores: StrictGeminiScore[],
    minScore: number = 60
): StrictGeminiScore[] {
    return scores
        // Remove safety risks
        .filter(s => !s.safetyFlag)
        // Remove low relevance
        .filter(s => s.matchScore >= minScore)
        // Sort by match score descending
        .sort((a, b) => b.matchScore - a.matchScore)
        // Top 10 results
        .slice(0, 10);
}

/**
 * Advanced Scoring with Deep Context + Strict Safety Filtering
 * @param places - Places with reviews and summaries
 * @param userProfile - User preferences including allergies and dietary
 * @param currentQuery - Search query for relevance matching
 * @returns Map of place_id to GeminiScore
 */
export async function scorePlacesWithDeepContext(
    places: PlaceWithContext[],
    userProfile: any,
    currentQuery: string | null = null
): Promise<Map<string, GeminiScore>> {
    if (!places.length) return new Map();

    const query = currentQuery || "General Recommendation";
    const prompt = buildStrictPrompt(places, userProfile, query);

    try {
        const result = await retryOperation(() => model.generateContent(prompt));
        const response = await result.response;
        const text = response.text();

        // Clean markdown artifacts
        const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();

        // Parse and validate with Zod
        const parseResult = GeminiResponseSchema.safeParse(JSON.parse(jsonStr));

        if (!parseResult.success) {
            console.error("[Gemini] Validation failed:", parseResult.error);
            // Fallback: Try lenient parsing
            const scores: any[] = JSON.parse(jsonStr);
            return convertToGeminiScores(places, scores);
        }

        const strictScores = parseResult.data;

        // Apply safety filtering
        const safeScores = filterSafeResults(strictScores, 60);

        console.log(`[Gemini] Filtered ${strictScores.length} → ${safeScores.length} safe results`);

        // Convert to Map<place_id, GeminiScore>
        const results = new Map<string, GeminiScore>();

        places.forEach((p) => {
            const score = strictScores.find(s => s.id === p.place_id);
            if (score) {
                results.set(p.place_id, {
                    matchScore: score.matchScore,
                    relevanceScore: score.relevanceScore,
                    safetyFlag: score.safetyFlag,
                    shortReason: score.shortReason,
                    recommendedDish: score.recommendedDish || "",
                    pros: score.pros,
                    cons: score.cons,
                    warnings: score.warnings,
                    warning: score.safetyFlag // Map safetyFlag to warning for compatibility
                });
            }
        });

        return results;
    } catch (error) {
        console.error("[Gemini] Strict Scoring Error:", error);
        return new Map();
    }
}

/**
 * Fallback converter for unvalidated responses
 */
function convertToGeminiScores(
    places: PlaceWithContext[],
    scores: any[]
): Map<string, GeminiScore> {
    const results = new Map<string, GeminiScore>();

    places.forEach((p, i) => {
        const raw = scores.find((s: any) => s.id === p.place_id) || scores[i] || {};

        results.set(p.place_id, {
            matchScore: typeof raw.matchScore === 'number' ? raw.matchScore : 70,
            relevanceScore: typeof raw.relevanceScore === 'number' ? raw.relevanceScore : 70,
            safetyFlag: !!raw.safetyFlag,
            shortReason: raw.shortReason || "AI analysis pending",
            recommendedDish: raw.recommendedDish || "",
            pros: Array.isArray(raw.pros) ? raw.pros : [],
            cons: Array.isArray(raw.cons) ? raw.cons : [],
            warnings: Array.isArray(raw.warnings) ? raw.warnings : (raw.warning_flag ? ["Potential dietary risk detected"] : []),
            warning: !!raw.safetyFlag || !!raw.warning_flag
        });
    });

    return results;
}
