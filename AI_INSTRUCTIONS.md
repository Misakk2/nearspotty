# AI Instructions & Project Context

## Project Structure Map

- **`src/app`**: Next.js App Router pages and API routes.
    - `api/`: Backend endpoints (Search, Stripe, Places, Reservations).
    - `(auth)/`: Authentication pages (Login, Signup).
    - `dashboard/`: User dashboard.
    - `search/`: Main search interface.
    - `onboarding/` & `business-onboarding/`: User and Business onboarding flows.
- **`src/components`**: Reusable UI components.
    - `ui/`: Shadcn/ui primitives.
    - `search/`: Search-specific components (PlaceCard, DecisionView).
    - `onboarding/`: Onboarding components.
- **`src/lib`**: Utility functions and configurations.
    - `firebase.ts`: Client-side Firebase.
    - `firebase-admin.ts`: Server-side Firebase Admin (Lazy Singleton).
    - `stripe.ts`: Stripe initialization.
    - `gemini.ts`: Google Gemini AI integration.
- **`src/hooks`**: Custom React hooks (`use-auth.tsx`, etc.).
- **`src/types`**: TypeScript interfaces (`Restaurant`, `place.ts`).

## Architectural Patterns & Hard Rules

### Backend Initialization
- **Lazy Singleton:** `src/lib/firebase-admin.ts` uses a lazy loading pattern to prevent "App already exists" errors during hot reloads and serverless cold starts. **DO NOT MODIFY** this initialization logic unless absolutely necessary.

### API & Error Handling
- **Health Check:** `/api/health-check` is the source of truth for server health. If you encounter 500 errors, check this endpoint first.
- **RoleGuard:** Found in `src/components/RoleGuard.tsx`. It manages access based on `diner` vs `owner` roles.

### Search & Data
- **Global Data, Personal Scoring:** We fetch candidates from Google Places, cache them in Firestore, and then score them personally using Gemini AI.
- **Images:** Always use the `/api/images/proxy` endpoint (via `proxy_url` field) for serving Google Maps photos to avoid client-side CORS and API key exposure.
- **Credits:** Search requires credits. Logic is handled in `src/app/api/search/route.ts`. "Pioneer Bonus" awards credits for discovering new locations.

### Webhooks
- **Stripe:** `/api/webhooks/stripe` handles subscription updates. Ensure the webhook secret is correctly set in `.env.local`.

## Debugging Protocol

1. **Server Errors:** Check `/api/health-check`.
2. **Hydration/SSR Errors:** Verify `RoleGuard` and other client components are robust against server execution (e.g., check for `window`).
3. **Database Rules:** If reads fail, check `firestore.rules`.
4. **Authentication:** Verify `useAuth` hook and session persistence.
