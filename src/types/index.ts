export interface UserPreferences {
    dietary: string[];
    allergies: string;
    cuisines: string[];
    radius: number;
    completedOnboarding: boolean;
}

export interface GeminiScore {
    dietaryScore: number;
    fitReason: string;
    recommendedDishes: string[];
    warnings: string[];
}
