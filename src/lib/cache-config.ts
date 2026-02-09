export const CACHE_DURATIONS = {
    PLACES_GRID: 7 * 24 * 60 * 60 * 1000,      // 7 days (restaurants don't change often)
    GEMINI_SCORES: 30 * 24 * 60 * 60 * 1000,   // 30 days
    CITY_AUTOCOMPLETE: 90 * 24 * 60 * 60 * 1000, // 90 days (static)
    PLACE_DETAILS: 7 * 24 * 60 * 60 * 1000     // 7 days
} as const;
