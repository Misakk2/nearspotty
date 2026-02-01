import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { useCallback } from "react";
import { Place } from "@/types/place";
import { GeminiScore } from "@/types";

/**
 * Search state persisted in React Query cache
 */
export interface SearchState {
    places: Place[];
    scores: Record<string, GeminiScore>;
    center: { lat: number; lng: number };
    cityId: string | null;
    cityName: string | null;
    selectedCategory: string | null;
    scrollPosition: number;
}

const SEARCH_STATE_KEY = ["search", "state"];
const DEFAULT_STATE: SearchState = {
    places: [],
    scores: {},
    center: { lat: 48.1486, lng: 17.1077 }, // Bratislava default
    cityId: "ChIJl2HKCjaJbEcRaEOI_Yi3d1w",
    cityName: "Bratislava",
    selectedCategory: null,
    scrollPosition: 0,
};

/**
 * useSearchState - Hook for managing search state with React Query
 * 
 * Provides:
 * - Automatic cache persistence across navigation
 * - State restoration on back navigation
 * - Methods to update individual state fields
 * 
 * @example
 * ```tsx
 * const { state, setPlaces, setLocation, setCategory, saveScrollPosition } = useSearchState();
 * ```
 */
export function useSearchState() {
    const queryClient = useQueryClient();

    // Get current state from cache (or initial if empty)
    const { data: state = DEFAULT_STATE } = useQuery({
        queryKey: SEARCH_STATE_KEY,
        queryFn: () => DEFAULT_STATE,
        staleTime: Infinity, // Never mark as stale - this is client state
        gcTime: 30 * 60 * 1000, // Keep for 30 minutes
    });

    /**
     * Update search state in cache
     */
    const updateState = useCallback(
        (updates: Partial<SearchState>) => {
            queryClient.setQueryData<SearchState>(SEARCH_STATE_KEY, (prev) => ({
                ...prev,
                ...DEFAULT_STATE,
                ...updates,
            }));
        },
        [queryClient]
    );

    /**
     * Set places and optionally scores
     */
    const setPlaces = useCallback(
        (places: Place[], scores?: Record<string, GeminiScore>) => {
            queryClient.setQueryData<SearchState>(SEARCH_STATE_KEY, (prev) => ({
                ...(prev ?? DEFAULT_STATE),
                places,
                ...(scores && { scores: { ...(prev?.scores ?? {}), ...scores } }),
            }));
        },
        [queryClient]
    );

    /**
     * Update scores for places
     */
    const updateScores = useCallback(
        (newScores: Record<string, GeminiScore>) => {
            queryClient.setQueryData<SearchState>(SEARCH_STATE_KEY, (prev) => ({
                ...(prev ?? DEFAULT_STATE),
                scores: { ...(prev?.scores ?? {}), ...newScores },
            }));
        },
        [queryClient]
    );

    /**
     * Set location (center, cityId, cityName)
     */
    const setLocation = useCallback(
        (location: { lat: number; lng: number; cityId?: string; cityName?: string }) => {
            queryClient.setQueryData<SearchState>(SEARCH_STATE_KEY, (prev) => ({
                ...(prev ?? DEFAULT_STATE),
                center: { lat: location.lat, lng: location.lng },
                ...(location.cityId && { cityId: location.cityId }),
                ...(location.cityName && { cityName: location.cityName }),
            }));
        },
        [queryClient]
    );

    /**
     * Set selected category
     */
    const setCategory = useCallback(
        (category: string | null) => {
            queryClient.setQueryData<SearchState>(SEARCH_STATE_KEY, (prev) => ({
                ...(prev ?? DEFAULT_STATE),
                selectedCategory: category,
            }));
        },
        [queryClient]
    );

    /**
     * Save scroll position before navigation
     */
    const saveScrollPosition = useCallback(
        (position: number) => {
            queryClient.setQueryData<SearchState>(SEARCH_STATE_KEY, (prev) => ({
                ...(prev ?? DEFAULT_STATE),
                scrollPosition: position,
            }));
        },
        [queryClient]
    );

    /**
     * Clear search results while keeping location
     */
    const clearResults = useCallback(() => {
        queryClient.setQueryData<SearchState>(SEARCH_STATE_KEY, (prev) => ({
            ...(prev ?? DEFAULT_STATE),
            places: [],
            scores: {},
            selectedCategory: null,
            scrollPosition: 0,
        }));
    }, [queryClient]);

    /**
     * Reset all state to defaults
     */
    const resetState = useCallback(() => {
        queryClient.setQueryData<SearchState>(SEARCH_STATE_KEY, DEFAULT_STATE);
    }, [queryClient]);

    return {
        state,
        updateState,
        setPlaces,
        updateScores,
        setLocation,
        setCategory,
        saveScrollPosition,
        clearResults,
        resetState,
    };
}
