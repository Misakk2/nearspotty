"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";

/**
 * QueryProvider - Wraps the app with React Query's QueryClientProvider
 * 
 * Features:
 * - Caches API responses for instant back-navigation
 * - Provides stale-while-revalidate pattern
 * - Configures sensible defaults for search state
 */
export function QueryProvider({ children }: { children: ReactNode }) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        // Keep data in cache for 10 minutes
                        staleTime: 10 * 60 * 1000,
                        // Cache data for 30 minutes before garbage collection
                        gcTime: 30 * 60 * 1000,
                        // Don't refetch on window focus for search results
                        refetchOnWindowFocus: false,
                        // Don't retry failed requests automatically
                        retry: false,
                    },
                },
            })
    );

    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}
