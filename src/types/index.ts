export interface UserPreferences {
    dietary: string[];
    allergies: string;
    cuisines: string[];
    radius: number;
    budget: 'low' | 'medium' | 'high' | 'any';
    completedOnboarding: boolean;
}

/**
 * AI-generated match score for a restaurant based on user preferences.
 * matchScore is 0-100 percentage representing how well the place fits user's profile.
 */
export interface GeminiScore {
    matchScore: number;        // 0-100 percentage
    shortReason: string;       // Brief explanation of match
    pros: string[];            // User-specific advantages
    cons: string[];            // User-specific disadvantages  
    recommendedDish: string;   // Single best dish recommendation
    warnings: string[];        // Dietary/allergy warnings
    warning?: boolean;         // Critical warning flag (e.g. cross-contamination)
}

/**
 * AI Usage tracking for subscription limits.
 * Free users get 5 AI checks per month.
 */
export interface AIUsage {
    count: number;
    lastResetDate: string; // ISO date string
}

/**
 * User subscription data for tier-based access.
 */
export interface UserSubscription {
    tier: 'free' | 'premium';
    status: 'active' | 'canceled' | 'expired';
    stripeCustomerId?: string;
    currentPeriodEnd?: string; // ISO date string
}
