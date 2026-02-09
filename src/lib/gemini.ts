/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GeminiScore } from "@/types";
import { GeminiResponseSchema, type StrictGeminiScore } from "@/lib/gemini-schema";
import { getAdminDb } from "./firebase-admin"; // ✅ NEW: For usage tracking

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

// ✅ NEW: Timeout Configuration
const TIMEOUT_MS = 60000; // 60 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// =============================================================================
// ✅ NEW: USAGE TRACKING & MONITORING
// =============================================================================

export interface GeminiUsageMetrics {
    operation: 'scout' | 'score' | 'batch-lite';
    tokensUsed: number;
    candidateCount: number;
    userId?: string;
    success: boolean;
    latencyMs: number;
    timestamp: Date;
    cost: number; // In USD
}

export async function logGeminiUsage(metrics: GeminiUsageMetrics): Promise<void> {
    try {
        await getAdminDb().collection('gemini_usage').add({
            ...metrics,
            timestamp: metrics.timestamp.toISOString()
        });

        // ✅ Console log for real-time monitoring
        console.log(`[Gemini] ${metrics.operation} - ${metrics.tokensUsed} tokens ($${metrics.cost.toFixed(4)}) - ${metrics.latencyMs}ms`);
    } catch (err) {
        console.error('[Gemini] Failed to log usage:', err);
        // Non-blocking - don't fail request if logging fails
    }
}

// ✅ NEW: Cost calculation (Flash model pricing)
export function calculateCost(tokens: number): number {
    // Gemini 2.0 Flash pricing: $0.10 per 1M input tokens
    return (tokens / 1_000_000) * 0.10;
}

// =============================================================================
// ✅ IMPROVED: RETRY WITH EXPONENTIAL BACKOFF
// =============================================================================

async function retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = MAX_RETRIES,
    delayMs: number = RETRY_DELAY_MS
): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error: any) {
            lastError = error;

            const isRetryable =
                error.status === 503 || // Service Overloaded
                error.status === 429 || // Rate Limit
                error.message?.includes('fetch') ||
                error.message?.includes('network');

            if (!isRetryable || attempt === maxRetries) {
                throw error;
            }

            const backoffDelay = delayMs * Math.pow(2, attempt - 1);
            console.warn(`[Gemini] Attempt ${attempt}/${maxRetries} failed. Retrying in ${backoffDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
        }
    }

    throw lastError;
}

// =============================================================================
// ✅ NEW: TIMEOUT WRAPPER
// =============================================================================

async function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operation: string
): Promise<T> {
    let timeoutId: NodeJS.Timeout | null = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`GEMINI_TIMEOUT_${operation}`));
        }, timeoutMs);
    });

    try {
        const result = await Promise.race([promise, timeoutPromise]);
        if (timeoutId) clearTimeout(timeoutId);
        return result;
    } catch (error) {
        if (timeoutId) clearTimeout(timeoutId);
        throw error;
    }
}

// =============================================================================
// ✅ IMPROVED: FALLBACK SCORE GENERATOR
// =============================================================================

function generateFallbackScores(
    places: any[],
    reason: 'timeout' | 'error' | 'dietary_filter'
): Map<string, GeminiScore> {
    const scores = new Map<string, GeminiScore>();

    places.forEach(p => {
        const baseScore = Math.min(100, (p.rating || 3) * 20);

        scores.set(p.place_id, {
            matchScore: baseScore,
            relevanceScore: 50,
            safetyFlag: false,
            shortReason: reason === 'timeout'
                ? "AI analysis timed out - showing rating-based score"
                : reason === 'error'
                    ? "AI temporarily unavailable - showing basic ranking"
                    : "Filtered by dietary preferences",
            recommendedDish: "",
            pros: [`${p.rating || 'N/A'}⭐ rating`],
            cons: ["AI analysis unavailable"],
            warnings: []
        });
    });

    return scores;
}

// =============================================================================
// ✅ IMPROVED: DIETARY-AWARE FALLBACK
// =============================================================================

function filterByDietaryRestrictions(
    candidates: LightCandidate[],
    userProfile: UserDietaryProfile
): LightCandidate[] {
    const isVegan = userProfile.dietary?.some(d => d.toLowerCase().includes('vegan'));
    const isVegetarian = userProfile.dietary?.some(d => d.toLowerCase().includes('vegetarian'));

    if (!isVegan && !isVegetarian) {
        return candidates; // No filtering needed
    }

    // ✅ RULE-BASED FILTERING (when Gemini fails)
    return candidates.filter(c => {
        const types = c.types.map(t => t.toLowerCase());
        const name = c.name.toLowerCase();

        // Exclude obvious meat-heavy places
        const meatKeywords = ['steakhouse', 'bbq', 'grill', 'butcher', 'meat_restaurant'];
        const hasMeat = meatKeywords.some(kw =>
            types.some(t => t.includes(kw)) || name.includes(kw)
        );

        return !hasMeat;
    });
}

// =============================================================================
// STAGE 2: SCOUT (WITH IMPROVEMENTS)
// =============================================================================

export interface LightCandidate {
    place_id: string;
    name: string;
    types: string[];
    rating?: number;
    userRatingCount?: number;
    location: { lat: number; lng: number };
    distance?: number;
}

interface UserDietaryProfile {
    allergies?: string[];
    dietary?: string[];
    cuisines?: string[];
    hasSuperlative?: boolean;
}

export interface ScoutResult {
    perfectMatches: string[];
    survivalOption?: {
        id: string;
        reason: string;
    };
    isSurvivalMode: boolean;
}

export async function scoutTopCandidates(
    lightCandidates: LightCandidate[],
    keyword: string,
    userProfile: UserDietaryProfile
): Promise<ScoutResult> {
    const startTime = Date.now();
    const emptyResult: ScoutResult = { perfectMatches: [], isSurvivalMode: false };

    if (!lightCandidates.length) return emptyResult;

    const hasDietaryRestrictions =
        (userProfile.dietary?.length ?? 0) > 0 ||
        (userProfile.allergies?.length ?? 0) > 0;

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
${JSON.stringify(candidatesPayload)}

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
        // ✅ NEW: Timeout wrapper
        const result = await withTimeout(
            retryOperation(() => model.generateContent(scoutPrompt)),
            TIMEOUT_MS,
            'SCOUT'
        );

        const response = await result.response;
        const text = response.text();

        // ✅ NEW: Track usage
        const metadata = await response.usageMetadata;
        if (metadata) {
            await logGeminiUsage({
                operation: 'scout',
                tokensUsed: metadata.totalTokenCount || 0,
                candidateCount: lightCandidates.length,
                success: true,
                latencyMs: Date.now() - startTime,
                cost: calculateCost(metadata.totalTokenCount || 0),
                timestamp: new Date()
            });
        }

        // ✅ IMPROVED: Safe JSON parsing
        let parsedJson: any;
        try {
            const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
            parsedJson = JSON.parse(jsonStr);
        } catch (parseError) {
            console.error('[Scout] JSON parse failed:', text.substring(0, 200));
            throw new Error('INVALID_JSON');
        }

        // Validate IDs
        const validIds = new Set(lightCandidates.map(c => c.place_id));
        const validPerfect = parsedJson.perfectMatches?.filter((id: string) => validIds.has(id)).slice(0, 6) || [];

        const scoutResult: ScoutResult = {
            perfectMatches: validPerfect,
            isSurvivalMode: validPerfect.length === 0 && !!parsedJson.survivalOption,
            survivalOption: parsedJson.survivalOption && validIds.has(parsedJson.survivalOption.id)
                ? parsedJson.survivalOption
                : undefined
        };

        console.log(`[Scout] Result: ${scoutResult.perfectMatches.length} perfect, survival=${scoutResult.isSurvivalMode}`);
        return scoutResult;

    } catch (error: any) {
        console.error("[Scout] AI selection failed:", error.message);

        // ✅ Log failure
        await logGeminiUsage({
            operation: 'scout',
            tokensUsed: 0,
            candidateCount: lightCandidates.length,
            success: false,
            latencyMs: Date.now() - startTime,
            cost: 0,
            timestamp: new Date()
        });

        // ✅ IMPROVED: Dietary-aware fallback
        const filtered = filterByDietaryRestrictions(lightCandidates, userProfile);
        const fallback = [...filtered]
            .sort((a, b) => (b.rating || 0) - (a.rating || 0))
            .slice(0, 6)
            .map(c => c.place_id);

        console.log(`[Scout] Fallback: ${fallback.length} dietary-filtered results`);
        return { perfectMatches: fallback, isSurvivalMode: false };
    }
}

// =============================================================================
// ✅ IMPROVED: DEEP CONTEXT SCORING WITH TIMEOUT
// =============================================================================

export interface PlaceForScoring {
    place_id: string;
    name: string;
    types: string[];
    rating?: number;
    price_level?: number;
    vicinity?: string;
}

export interface PlaceWithContext extends PlaceForScoring {
    editorialSummary?: string;
    reviews?: { text: string; rating: number; flag?: "SAFE_CANDIDATE" | "RISK" }[];
    websiteUri?: string;
    servesVegetarianFood?: boolean;
}

// ... (Keep existing STRICT_SYSTEM_INSTRUCTION and buildStrictPrompt)

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
- Highlight risky places

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
# RESTAURANTS TO ANALYZE
${JSON.stringify(placesPayload)}

Analyze each restaurant and return the JSON array.
`;
}

export async function scorePlacesWithDeepContext(
    places: PlaceWithContext[],
    userProfile: any,
    currentQuery: string | null = null
): Promise<Map<string, GeminiScore>> {
    const startTime = Date.now();

    if (!places.length) return new Map();

    const query = currentQuery || "General Recommendation";
    const prompt = buildStrictPrompt(places, userProfile, query);

    let timeoutId: NodeJS.Timeout | null = null;

    try {
        // ✅ NEW: Promise.race with cleanup
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
                reject(new Error('GEMINI_TIMEOUT_SCORE'));
            }, TIMEOUT_MS);
        });

        const geminiPromise = retryOperation(() => model.generateContent(prompt));

        const result = await Promise.race([geminiPromise, timeoutPromise]);

        // ✅ Clear timeout on success
        if (timeoutId) clearTimeout(timeoutId);

        const response = await result.response;
        const text = response.text();

        // ✅ Track usage
        const metadata = await response.usageMetadata;
        if (metadata) {
            await logGeminiUsage({
                operation: 'score',
                tokensUsed: metadata.totalTokenCount || 0,
                candidateCount: places.length,
                success: true,
                latencyMs: Date.now() - startTime,
                cost: calculateCost(metadata.totalTokenCount || 0),
                timestamp: new Date()
            });
        }

        // ✅ IMPROVED: Safe parsing
        let parsedJson: any;
        try {
            const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
            parsedJson = JSON.parse(jsonStr);
        } catch (parseError) {
            console.error('[Gemini] JSON parse failed:', text.substring(0, 200));
            return generateFallbackScores(places, 'error');
        }

        const parseResult = GeminiResponseSchema.safeParse(parsedJson);

        if (!parseResult.success) {
            console.error("[Gemini] Validation failed:", parseResult.error);
            return convertToGeminiScores(places, parsedJson);
        }

        const strictScores = parseResult.data;
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
                    warning: score.safetyFlag
                });
            }
        });

        return results;

    } catch (error: any) {
        // ✅ Clear timeout on error
        if (timeoutId) clearTimeout(timeoutId);

        console.error("[Gemini] Scoring error:", error.message);

        // ✅ Log failure
        await logGeminiUsage({
            operation: 'score',
            tokensUsed: 0,
            candidateCount: places.length,
            success: false,
            latencyMs: Date.now() - startTime,
            cost: 0,
            timestamp: new Date()
        });

        // ✅ Return fallback scores
        if (error.message?.includes('TIMEOUT')) {
            console.warn('[Gemini] Timeout - returning fallback scores');
            return generateFallbackScores(places, 'timeout');
        }

        return generateFallbackScores(places, 'error');
    }
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
