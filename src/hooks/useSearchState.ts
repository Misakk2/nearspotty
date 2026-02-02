import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Place } from "@/types/place";
import { GeminiScore } from "@/types";

/**
 * Search state persisted in localStorage via Zustand
 */
export interface SearchState {
    places: Place[];
    scores: Record<string, GeminiScore>;
    center: { lat: number; lng: number };
    cityId: string | null;
    cityName: string | null;
    selectedCategory: string | null;
    scrollPosition: number;
    searchQuery: string;
    isLoading: boolean;

    // Actions
    setPlaces: (places: Place[], scores?: Record<string, GeminiScore>) => void;
    updateScores: (newScores: Record<string, GeminiScore>) => void;
    setLocation: (location: { lat: number; lng: number; cityId?: string; cityName?: string }) => void;
    setCity: (city: { id: string; name: string; lat: number; lng: number }) => void;
    setCategory: (category: string | null) => void;
    setSearchQuery: (query: string) => void;
    setLoading: (loading: boolean) => void;
    saveScrollPosition: (position: number) => void;
    startSearch: () => void;
    resetSearch: () => void;
    resetState: () => void;
}

const DEFAULT_STATE = {
    places: [],
    scores: {},
    center: { lat: 48.1486, lng: 17.1077 }, // Bratislava default
    cityId: "ChIJl2HKCjaJbEcRaEOI_Yi3d1w",
    cityName: "Bratislava",
    selectedCategory: null,
    scrollPosition: 0,
    searchQuery: "",
    isLoading: false,
};

export const useSearchStore = create<SearchState>()(
    persist(
        (set) => ({
            ...DEFAULT_STATE,

            setPlaces: (places, scores) => set((state) => ({
                places,
                scores: scores ? { ...state.scores, ...scores } : state.scores,
                isLoading: false
            })),

            updateScores: (newScores) => set((state) => ({
                scores: { ...state.scores, ...newScores }
            })),

            setLocation: (location) => set((state) => ({
                center: { lat: location.lat, lng: location.lng },
                ...(location.cityId && { cityId: location.cityId }),
                ...(location.cityName && { cityName: location.cityName })
            })),

            setCity: (city) => set({
                cityId: city.id,
                cityName: city.name,
                center: { lat: city.lat, lng: city.lng },
                places: [], // Clear places on city change
                scores: {},
                selectedCategory: null, // Optional: Clear category on city change? User said "UI must react without a reload". Clearing specific results is key.
                isLoading: false
            }),

            setCategory: (category) => set({ selectedCategory: category }),

            setSearchQuery: (query) => set({ searchQuery: query }),

            setLoading: (loading) => set({ isLoading: loading }),

            saveScrollPosition: (position) => set({ scrollPosition: position }),

            startSearch: () => set({
                places: [],
                scores: {},
                isLoading: true
            }),

            // Wipes query, places, and filters (Clean Slate)
            resetSearch: () => set((state) => ({
                places: [],
                scores: {},
                selectedCategory: null,
                searchQuery: "",
                isLoading: false,
                scrollPosition: 0
            })),

            resetState: () => set(DEFAULT_STATE),
        }),
        {
            name: 'search-storage',
            storage: createJSONStorage(() => localStorage),
            version: 1, // Bump this to invalidate old cache
            migrate: (persistedState: any, version: number) => {
                if (version === 0) {
                    // if the stored value is in version 0, we clear it (return default)
                    return DEFAULT_STATE;
                }
                return persistedState as SearchState;
            },
            partialize: (state) => ({
                // Persist these fields
                places: state.places,
                scores: state.scores,
                center: state.center,
                cityId: state.cityId,
                cityName: state.cityName,
                selectedCategory: state.selectedCategory,
                scrollPosition: state.scrollPosition,
                searchQuery: state.searchQuery
            }),
        }
    )
);

/**
 * Adapter hook to maintain backward compatibility
 */
export function useSearchState() {
    const store = useSearchStore();

    return {
        state: {
            places: store.places,
            scores: store.scores,
            center: store.center,
            cityId: store.cityId,
            cityName: store.cityName,
            selectedCategory: store.selectedCategory,
            scrollPosition: store.scrollPosition,
            searchQuery: store.searchQuery,
            isLoading: store.isLoading,
        },
        setPlaces: store.setPlaces,
        updateScores: store.updateScores,
        setLocation: store.setLocation,
        setCity: store.setCity,
        setCategory: store.setCategory,
        setSearchQuery: store.setSearchQuery,
        setLoading: store.setLoading,
        startSearch: store.startSearch, // NEW ACTION
        saveScrollPosition: store.saveScrollPosition,
        clearResults: store.resetSearch, // Alias for backward compat if needed, or update consumers
        resetSearch: store.resetSearch,
        resetState: store.resetState,
    };
}
