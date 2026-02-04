import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { checkUserLimit } from "@/lib/user-limits";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Missing or invalid token" }, { status: 401 });
        }

        const idToken = authHeader.split("Bearer ")[1];
        let decodedToken;

        try {
            decodedToken = await adminAuth.verifyIdToken(idToken);
        } catch (e) {
            console.error("Token verification failed:", e);
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = decodedToken.uid;
        if (!userId) {
            return NextResponse.json({ error: "User ID not found" }, { status: 400 });
        }

        // Authoritative Check
        const status = await checkUserLimit(userId);

        return NextResponse.json({
            plan: status.tier, // Mapped to 'plan' as requested
            usage: status.count, // Mapped to 'usage' as requested
            limit: status.limit,
            remaining: status.remaining,
            // Keeping these for internal consistency and debugging
            limitReached: status.limitReached,
            lastReset: status.lastResetDate
        });

    } catch (error) {
        console.error("[User Status API] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
