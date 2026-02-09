
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { PlacesCacheEntry } from "@/types/cached-places";

/**
 * Cache Warming Cron Job
 * 
 * Frequency: Every 10-15 minutes (recommended)
 * Action: Finds grid cache entries expiring within the next hour and refreshes them.
 * Strategy: Self-calls the /api/places/discover endpoint to leverage existing logic.
 */

export async function GET(request: NextRequest) {
    // 1. Authorization Verification
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // Allow if CRON_SECRET matches OR if running in development (no secret checked strictly if env missing, but recommended)
    // Also support manual triggering by Admin if needed (via Bearer token - omitted for brevity, sticking to Cron key)
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        // Fallback: Check for URL param ?key=... for easy manual testing
        const url = new URL(request.url);
        const apiKey = url.searchParams.get("key");
        if (apiKey !== cronSecret) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
    }

    try {
        const db = getAdminDb();
        const now = Date.now();
        // Look for entries expiring in the next 60 minutes
        const lookaheadMs = 60 * 60 * 1000;
        const cutoff = now + lookaheadMs;

        console.log(`[CacheWarming] Scanning for entries expiring before ${new Date(cutoff).toISOString()}...`);

        // Query fields: 'expires_at'
        // Index required: places_grid_cache_v2 (expires_at ASC)
        const snapshot = await db.collection("cache_places_grid_v2")
            .where("expires_at", "<", cutoff)
            .where("expires_at", ">", now) // Don't warm already expired (they are dead)
            .orderBy("expires_at", "asc")
            .limit(5) // Process max 5 per run to avoid timeouts/rate-limits
            .get();

        if (snapshot.empty) {
            console.log("[CacheWarming] No entries need warming.");
            return NextResponse.json({ status: "skipped", message: "No expiring entries found" });
        }

        console.log(`[CacheWarming] Found ${snapshot.size} entries to refresh.`);

        const results = [];
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

        for (const doc of snapshot.docs) {
            const data = doc.data() as PlacesCacheEntry;
            const { lat, lng, radius, type } = data.search_params;

            // POPULARITY CHECK:
            // If the grid hasn't been accessed in the last 14 days, let it die.
            // This saves costs on "one-off" searches in middle of nowhere.
            const LAST_ACCESSED_THRESHOLD = 14 * 24 * 60 * 60 * 1000; // 14 days
            const lastAccessed = data.last_accessed || 0; // Default to 0 if undefined (old cache)

            if (now - lastAccessed > LAST_ACCESSED_THRESHOLD) {
                console.log(`[CacheWarming] Skipping ${data.grid_key} (Last accessed: ${new Date(lastAccessed).toISOString()}) - too old.`);
                results.push({ key: data.grid_key, status: "skipped_inactive" });
                continue;
            }

            // Construct Refresh URL
            // We use /api/places/discover because it populates the cache
            const refreshUrl = new URL(`${baseUrl}/api/places/discover`);
            refreshUrl.searchParams.set("lat", lat.toString());
            refreshUrl.searchParams.set("lng", lng.toString());
            refreshUrl.searchParams.set("radius", radius.toString());
            if (type) refreshUrl.searchParams.set("type", type);

            // Add a flag to indicate this is a background refresh (optional, for logging)
            refreshUrl.searchParams.set("source", "cron");

            console.log(`[CacheWarming] Refreshing grid: ${data.grid_key} ...`);

            try {
                // Perform the fetch
                const res = await fetch(refreshUrl.toString(), {
                    method: "GET",
                    // Pass a secret to bypass rate limits if configured?
                    // For now, reliance on internal rate generation limits or just standard access.
                    // Ideally, we should pass a system token.
                });

                if (res.ok) {
                    results.push({ key: data.grid_key, status: "success" });
                } else {
                    results.push({ key: data.grid_key, status: "error", code: res.status });
                    console.error(`[CacheWarming] Failed to refresh ${data.grid_key}: ${res.status}`);
                }
            } catch (err) {
                console.error(`[CacheWarming] Network error for ${data.grid_key}:`, err);
                results.push({ key: data.grid_key, status: "network_error" });
            }
        }

        return NextResponse.json({
            status: "success",
            processed: results.length,
            details: results
        });

    } catch (error) {
        console.error("[CacheWarming] Critical Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
