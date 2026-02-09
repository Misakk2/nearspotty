import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
    // Only log API requests
    if (request.nextUrl.pathname.startsWith("/api/")) {
        const method = request.method;
        const url = request.nextUrl.pathname;
        const authHeader = request.headers.get("authorization");
        const hasAuth = !!authHeader;

        // Log 401/403 candidates (Passive Monitoring)
        if (!hasAuth && (url.includes("/admin") || url.includes("/secure") || url.includes("/reservations"))) {
            const ip = request.headers.get("x-forwarded-for") || "unknown";
            console.warn(`[Security] Unauthorized API access attempt: ${method} ${url} from ${ip}`);
        }

        // Log all writes to sensitive endpoints
        if (method !== "GET" && (url.includes("/users") || url.includes("/credits"))) {
            console.log(`[Security] Write attempt to sensitive endpoint: ${method} ${url} (Auth: ${hasAuth})`);
        }
    }
    return NextResponse.next();
}

export const config = {
    matcher: "/api/:path*",
};
