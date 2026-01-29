// Plan limits configuration for NearSpotty
// These define the usage restrictions for different subscription tiers

export type DinerPlan = 'free' | 'premium';
export type BusinessPlan = 'free' | 'basic' | 'pro' | 'enterprise';
export type UserPlan = DinerPlan | BusinessPlan;

// Stripe Price IDs
export const STRIPE_PRICES = {
    // Diner plans
    diner_premium: 'price_1SuvxKEOZfDm5I749j79vou5', // €9.99/month

    // Business plans
    business_basic: 'price_1SuvxLEOZfDm5I74RvCbvgkg',      // €29/month
    business_pro: 'price_1SuvxLEOZfDm5I74QLxVBQKw',        // €79/month
    business_enterprise: 'price_1SuvxMEOZfDm5I74I28E8OtJ', // €199/month
} as const;

// Plan names to price ID mapping
export const PLAN_TO_PRICE: Record<string, string> = {
    premium: STRIPE_PRICES.diner_premium,
    basic: STRIPE_PRICES.business_basic,
    pro: STRIPE_PRICES.business_pro,
    enterprise: STRIPE_PRICES.business_enterprise,
};

// Diner plan limits
export const DINER_LIMITS = {
    free: {
        aiChecksPerMonth: 5,
        priorityReservations: false,
        exclusiveDeals: false,
    },
    premium: {
        aiChecksPerMonth: Infinity,
        priorityReservations: true,
        exclusiveDeals: true,
    },
} as const;

// Business plan limits
export const BUSINESS_LIMITS = {
    free: {
        reservationsPerMonth: 10,
        perCoverFee: 2.00,
        aiInsights: false,
        priorityListing: false,
        smsNotifications: false,
        multiLocation: false,
        apiAccess: false,
    },
    basic: {
        reservationsPerMonth: 50,
        perCoverFee: 1.50,
        aiInsights: false,
        priorityListing: false,
        smsNotifications: false,
        multiLocation: false,
        apiAccess: false,
    },
    pro: {
        reservationsPerMonth: Infinity,
        perCoverFee: 1.00,
        aiInsights: true,
        priorityListing: true,
        smsNotifications: true,
        multiLocation: false,
        apiAccess: false,
    },
    enterprise: {
        reservationsPerMonth: Infinity,
        perCoverFee: 0.50,
        aiInsights: true,
        priorityListing: true,
        smsNotifications: true,
        multiLocation: true,
        apiAccess: true,
    },
} as const;

// Helper to get limits for a user
export function getDinerLimits(plan: DinerPlan) {
    return DINER_LIMITS[plan] || DINER_LIMITS.free;
}

export function getBusinessLimits(plan: BusinessPlan) {
    return BUSINESS_LIMITS[plan] || BUSINESS_LIMITS.free;
}

// Check if user has exceeded their AI check limit
export function canUseAICheck(plan: DinerPlan, currentUsage: number): boolean {
    const limits = getDinerLimits(plan);
    return currentUsage < limits.aiChecksPerMonth;
}

// Check if business has exceeded their reservation limit
export function canAcceptReservation(plan: BusinessPlan, currentUsage: number): boolean {
    const limits = getBusinessLimits(plan);
    return currentUsage < limits.reservationsPerMonth;
}

// Get remaining AI checks
export function getRemainingAIChecks(plan: DinerPlan, currentUsage: number): number {
    const limits = getDinerLimits(plan);
    if (limits.aiChecksPerMonth === Infinity) return Infinity;
    return Math.max(0, limits.aiChecksPerMonth - currentUsage);
}

// Get remaining reservations
export function getRemainingReservations(plan: BusinessPlan, currentUsage: number): number {
    const limits = getBusinessLimits(plan);
    if (limits.reservationsPerMonth === Infinity) return Infinity;
    return Math.max(0, limits.reservationsPerMonth - currentUsage);
}
