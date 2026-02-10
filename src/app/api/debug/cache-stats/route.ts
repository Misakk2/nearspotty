/**
 * Cache statistics endpoint for monitoring and debugging.
 * Protected by admin role check.
 */

import { NextResponse } from "next/server";
import { getCacheMetrics } from "@/lib/cache-utils";
import { getAdminDb } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

export async function GET() {
    try {
        // Admin check - verify user is authenticated
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("session")?.value;

        if (!sessionCookie) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Verify session and check if user is admin
        const { getAuth } = await import("firebase-admin/auth");
        const decodedToken = await getAuth().verifySessionCookie(sessionCookie, true);

        // Check if user has admin privileges
        const userDoc = await getAdminDb().collection("users").doc(decodedToken.uid).get();
        const userData = userDoc.data();

        if (userData?.role !== "admin") {
            return NextResponse.json({ error: "Forbidden - Admin only" }, { status: 403 });
        }

        // Get in-memory cache metrics
        const inMemoryMetrics = getCacheMetrics();

        // Get Firestore cache collection stats
        const gridCacheSnap = await getAdminDb().collection("cache_places_grid_v2").get();
        const detailsCacheSnap = await getAdminDb().collection("place_details_cache_v2").get();
        const cityCacheSnap = await getAdminDb().collection("cache_places_city_v2").get();

        const now = Date.now();

        // Analyze grid cache
        let gridActive = 0;
        let gridExpired = 0;
        gridCacheSnap.forEach(doc => {
            const data = doc.data();
            if (now - data.timestamp < data.ttl) {
                gridActive++;
            } else {
                gridExpired++;
            }
        });

        // Analyze details cache
        let detailsActive = 0;
        let detailsExpired = 0;
        detailsCacheSnap.forEach(doc => {
            const data = doc.data();
            if (now - data.timestamp < data.ttl) {
                detailsActive++;
            } else {
                detailsExpired++;
            }
        });

        // Calculate hit rate from in-memory metrics
        const totalHits = Array.from(Object.values(inMemoryMetrics)).reduce(
            (sum: number, metric: { hits: number }) => sum + metric.hits,
            0
        );

        return NextResponse.json({
            timestamp: new Date().toISOString(),
            inMemory: {
                totalTrackedKeys: Object.keys(inMemoryMetrics).length,
                totalHits,
                topKeys: Object.entries(inMemoryMetrics)
                    .sort(([, a], [, b]) => (b as { hits: number }).hits - (a as { hits: number }).hits)
                    .slice(0, 10)
                    .map(([key, metrics]) => ({ key, ...(metrics as { hits: number; lastAccessed: number }) }))
            },
            firestore: {
                grid: {
                    total: gridCacheSnap.size,
                    active: gridActive,
                    expired: gridExpired
                },
                details: {
                    total: detailsCacheSnap.size,
                    active: detailsActive,
                    expired: detailsExpired
                },
                city: {
                    total: cityCacheSnap.size
                }
            }
        });

    } catch (error) {
        console.error("[CacheStats] Error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
