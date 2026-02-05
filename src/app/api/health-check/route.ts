import { NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";

/**
 * Health Check Endpoint for Production Diagnostics
 * Tests: Environment variables, Firestore connection, Auth SDK initialization
 * 
 * Usage: GET /api/health-check
 */
export async function GET() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const checks: Record<string, any> = {
        timestamp: new Date().toISOString(),
        env: {
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? "✅" : "❌ MISSING",
            storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ? "✅" : "❌ MISSING",
            googleMapsKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ? "✅" : "❌ MISSING",
            geminiKey: process.env.GEMINI_API_KEY ? "✅" : "⚠️ Backend only",
            stripeKey: process.env.STRIPE_SECRET_KEY ? "✅" : "⚠️ Backend only",
        },
        firestore: "pending",
        auth: "pending",
    };

    // Test Firestore Read
    try {
        const testDoc = await getAdminDb().collection("cities").limit(1).get();
        checks.firestore = testDoc.empty
            ? "✅ Connected (empty collection)"
            : `✅ Connected (found ${testDoc.size} doc(s))`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
        checks.firestore = `❌ Error: ${e.code || e.message}`;
        console.error("[Health Check] Firestore error:", e);
    }

    // Test Auth SDK
    try {
        const app = getAdminAuth().app;
        checks.auth = app ? "✅ SDK Initialized" : "❌ Not initialized";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
        checks.auth = `❌ Error: ${e.message}`;
        console.error("[Health Check] Auth error:", e);
    }

    // Compute overall status
    const hasErrors = JSON.stringify(checks).includes("❌");

    return NextResponse.json({
        status: hasErrors ? "unhealthy" : "healthy",
        checks
    }, {
        status: hasErrors ? 503 : 200
    });
}
