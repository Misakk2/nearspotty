/**
 * User preferences for personalized restaurant recommendations.
 */
export interface UserPreferences {
    cuisines: string[];
    dietary: string[];
    allergies: string[];         // Changed from string to string[] for multiple allergies
    budget: 'low' | 'medium' | 'high' | 'any';
}

/**
 * User search defaults.
 */
export interface SearchDefaults {
    radius: number;
    city?: string;
    location?: { lat: number; lng: number };
}

/**
 * User profile data (organized).
 */
export interface UserProfile {
    preferences: UserPreferences;
    searchDefaults: SearchDefaults;
    completedOnboarding: boolean;
}

/**
 * User subscription data for tier-based access.
 */
export interface UserSubscription {
    status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired';
    tier: 'free' | 'premium' | 'basic' | 'pro' | 'enterprise';
    plan: string;
    stripeSubscriptionId?: string;
    stripeCustomerId?: string;
    currentPeriodEnd?: string;
    cancelAtPeriodEnd: boolean;
    cancelAt?: string;
    updatedAt: string;
}

/**
 * AI Credits system - replaces legacy AIUsage.
 * Free users: 5 credits/month, Premium: unlimited (-1)
 */
export interface UserCredits {
    remaining: number;  // -1 = unlimited (premium)
    used: number;
    resetDate: string;
    limit: number;      // 5 for free, -1 for unlimited
}

/**
 * Complete User document structure.
 */
export interface User {
    uid: string;
    email: string;
    displayName?: string;
    role: 'diner' | 'owner';

    // Single source of truth for tier (Migration: Prefer subscription.tier)
    tier: 'free' | 'premium' | 'basic' | 'pro' | 'enterprise';

    subscription: UserSubscription;
    credits: UserCredits;
    profile: UserProfile;

    createdAt: string;
    updatedAt: string;
}

/**
 * AI-generated match score for a restaurant based on user preferences.
 * matchScore is 0-100 percentage representing how well the place fits user's profile.
 */
export interface GeminiScore {
    matchScore: number;        // 0-100 percentage (overall fit)
    relevanceScore?: number;   // 0-100 percentage (query relevance)
    safetyFlag?: boolean;      // TRUE if allergy risk detected
    shortReason: string;       // Brief explanation of match
    pros: string[];            // User-specific advantages
    cons: string[];            // User-specific disadvantages  
    recommendedDish: string;   // Single best dish recommendation
    warnings: string[];        // Dietary/allergy warnings
    warning?: boolean;         // Critical warning flag (e.g. cross-contamination)
}

/**
 * Google Places image metadata with optional cached URL
 */
export interface RestaurantImage {
    photoReference: string;  // Google Photo API reference
    width: number;
    height: number;
    cachedUrl?: string;      // GCS URL if image is cached
}

/**
 * Owner-uploaded image for claimed restaurants
 */
export interface OwnerImage {
    url: string;             // GCS or external URL
    isPrimary: boolean;      // Main display image
    uploadedAt: string;      // ISO timestamp
    caption?: string;        // Optional description
}

/**
 * Restaurant entity - cached in Firestore for cost optimization
 * Supports owner claiming and image overrides
 */
export interface Restaurant {
    placeId: string;         // Google Place ID (primary key)

    // Google Places Data (refreshed on cache miss)
    details: {
        name: string;
        address: string;
        geometry: {
            location: { lat: number; lng: number };
        };
        rating?: number;
        priceLevel?: number;
        types: string[];
        phoneNumber?: string;
        website?: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        openingHours?: any;
        userRatingCount?: number;
        formattedAddress?: string;
        editorialSummary?: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reviews?: any[];
    };

    // Image Management with Priority System
    images: {
        google: RestaurantImage[];   // From Google Photos API
        owner: OwnerImage[];         // Uploaded by claimed owners (takes priority)
    };

    // Owner Claiming (future feature)
    claimed: boolean;
    claimedBy?: string;      // User UID of claimer
    claimedAt?: string;      // ISO timestamp

    // Managed Content (Claimed features)
    menu?: {
        items: {
            id: string;
            name: string;
            description?: string;
            price: number;
            weight?: string;
            imageUrl?: string;
            allergens?: string[];
            dietary?: string[];
            category: string;
        }[];
    };
    tableConfig?: {
        totalTables: number;
        seatsPerTable: number;
        bookableTables?: number;
    };

    // Cache Metadata for staleness detection
    cacheMetadata: {
        lastFetched: string;  // ISO timestamp
        expiresAt: string;    // ISO timestamp (lastFetched + 7 days)
        source: 'google' | 'manual'; // How data was obtained
        dataLevel: 'light' | 'rich'; // Tracks how complete the data is (light=Stage1, rich=Stage3)
    };

    // Geohash for geo-queries (computed from lat/lng)
    geohash?: string;

    createdAt: string;
    updatedAt: string;
}

/**
 * @deprecated Use UserCredits instead
 * Legacy AI Usage tracking - kept for backward compatibility
 */
export interface AIUsage {
    count: number;
    lastResetDate: string;
}
