import { z } from 'zod';

/**
 * Strict Gemini Score Schema with Safety Flagging
 * Used for validating AI responses with dietary/allergy safety checks
 */
export const StrictGeminiScoreSchema = z.object({
    id: z.string(),                                  // place_id
    relevanceScore: z.number().min(0).max(100),      // Query match (0-100)
    matchScore: z.number().min(0).max(100),          // Overall fit (0-100)
    safetyFlag: z.boolean(),                         // TRUE if allergy risk detected
    shortReason: z.string().max(150),                // User-facing explanation
    recommendedDish: z.string().optional(),          // Best dish for this user
    pros: z.array(z.string()),                       // User-specific advantages
    cons: z.array(z.string()),                       // User-specific disadvantages
    warnings: z.array(z.string())                    // Dietary/allergy warnings
});

/**
 * Array of Gemini scores (full API response)
 */
export const GeminiResponseSchema = z.array(StrictGeminiScoreSchema);

/**
 * TypeScript type inference from Zod schema
 */
export type StrictGeminiScore = z.infer<typeof StrictGeminiScoreSchema>;
export type GeminiResponse = z.infer<typeof GeminiResponseSchema>;
