# AI CONTEXT MASTER
> **TRUTH SOURCE FOR NEARSPOTTY**
> *Read this file at the start of every session to understand the full project context.*

## 1. Tech Stack & Environment
- **Framework:** Next.js 15 (App Router, Turbopack)
- **Language:** TypeScript 5+ (Strict Mode)
- **Styling:** Tailwind CSS 3.4 (with `tailwindcss-animate`, `lucide-react`)
- **Backend:** Firebase 12.8 (Firestore, Auth, Functions), Firebase Admin 13.6
- **Payments:** Stripe 20.1 (API Version: `2026-01-28.clover`)
- **Maps:** Google Maps JS API (`@googlemaps/js-api-loader`) + Places API (New V1)
- **AI:** Gemini 3 Flash Preview (`@google/generative-ai`)
- **State Mgmt:** Zustand (`src/store`), React Query (`@tanstack/react-query`)
- **Deployment:** Vercel (Frontend/API) + Firebase (Functions/Firestore)
- **Firebase MCP:** `firebase-mcp`
- **Stripe MCP:** `stripe-mcp`
- **Google Maps MCP:** `google-maps-mcp`

### Folder Structure Map
- **`src/app/api`**: API Routes (Server-side logic).
- **`src/components/ui`**: Reusable Shadcn/Radix primitives.
- **`src/components/search`**: Core search UI (Map, Cards, Filters).
- **`src/lib`**: Core logic & Singletons (`firebase-admin`, `stripe`, `gemini`).
- **`src/types`**: TypeScript interfaces (Database Schema).
- **`src/hooks`**: Custom React hooks (`useSearchState`, `useUsageLimits`).
- **`src/store`**: Global client state (Zustand).

---

## 2. Database Schema (Firestore Truth)

### `users/{uid}` (Single Source of Truth for Roles & Subs)
| Field | Type | Description |
| :--- | :--- | :--- |
| `role` | `'diner' \| 'owner'` | **AUTHORITY.** Do not trust token claims. Read from DB. |
| `stripeCustomerId`| `string` | **AUTHORITY.** Stripe Customer ID (Top-Level). Used for lookups. |
| `subscription` | `Object` | **SSoT for Tier.** `{ tier, status, stripeSubscriptionId, currentPeriodEnd }`. |
| `credits` | `Object` | `{ remaining: number, limit: number, resetDate: ISO }`. `-1` = Unlimited. |
| `profile` | `Object` | User preferences (`allergies`, `budget`, etc.). |

### `restaurants/{placeId}` (Cached & Owned Data)
| Field | Type | Description |
| :--- | :--- | :--- |
| `isClaimed` | `boolean` | **CRITICAL.** Reads/Writes must respect this. |
| `ownerId` | `string` | UID of the owner (if claimed). |
| `images.owner` | `Array` | Owner-uploaded photos (Priority 1). |
| `images.google` | `Array` | Google Maps photos (Priority 2). |
| `cacheMetadata`| `Object` | `{ lastFetched: ISO, varies: 'light'\|'rich' }`. |


### `reservations/{reservationId}` (Private Transactional Data)
| Field | Type | Description |
| :--- | :--- | :--- |
| `userId` | `string` | **Owner.** The diner who made the reservation. |
| `restaurantId` | `string` | **Target.** The restaurant (Place ID). |
| `status` | `'pending' \| 'confirmed' \| 'rejected' \| 'cancelled'` | Current state. |
| `date` / `time` | `string` | ISO Date / 24h Time. |
| `partySize` | `number` | Number of guests. |
| `customerName` | `string` | Snapshot of contact name. |
| `historyLog` | `Array` | Audit trail of status changes `{ status, timestamp, by }`. |

---

## 3. Critical Business Logic (The "Laws")

### 💳 Stripe & Subscription
1.  **Webhook Authority:** The Stripe Webhook (`src/app/api/webhooks/stripe`) is the **ONLY** writer for subscription status.
    -   `invoice.paid`: Grants/Renews `premium` tier.
    -   `checkout.session.completed`: Handles **initial upgrade** AND **restaurant claiming**.
    -   `customer.subscription.deleted`: Downgrades to `free` and **removes claims**.
2.  **Claiming Flow:** A restaurant is *only* claimed if `checkout.session.completed` has metadata: `{ placeId: "..." }`.
    -   *Limit:* One owner per restaurant (enforced by `isClaimed` check).
3.  **Plan Limits:**
    -   **Diner Free:** 5 AI Checks/mo.
    -   **Diner Premium:** Unlimited.
    -   **Business:** See `src/lib/plan-limits.ts` for tiered reservation limits.
    -   **Configuration Truth (`src/lib/plan-limits.ts`):**
        -   **MUST** use **Price IDs** (`price_...`), NOT Product IDs (`prod_...`).
        -   *Current Valid IDs (EU/Test):*
            -   Diner Premium: `price_1SuvxKEOZfDm5I749j79vou5` (€9.99/mo)
            -   Business Basic: `price_1SuvxLEOZfDm5I74RvCbvgkg` (€29/mo)
            -   Business Pro: `price_1SuvxLEOZfDm5I74QLxVBQKw` (€79/mo)
            -   Business Enterprise: `price_1SuvxMEOZfDm5I74I28E8OtJ` (€199/mo)

### 🔍 Search & AI Scoring (The "Two-Stage Funnel")
1.  **Stage 1 (Light):** Fetch 20 candidates (Firestore Cache OR Google Places `searchNearby`). **Strict Radius.**
    -   *Source:* `src/app/api/search/route.ts` -> `findLightCandidates()`.
2.  **The Fork:** If user has **NO CREDITS**, return Light results (stop here).
3.  **Stage 2 (Scout - Premium/Credit):** Gemini analyzes 20 -> Picks Top 6.
4.  **Stage 3 (Enrich):** Fetch **FULL** details (Reviews, Photos) for Top 6 only (Cost saving).
5.  **Stage 4 (Score):** Gemini Deep Scoring. Deducts 1 Credit.
6.  **Pioneer Bonus:** User gets **+2 Credits** if search yields 0% cache hits (Pure Google fetch) AND scoring succeeds.

### 📅 Reservation System
1.  **Flow:** User requests -> Owner confirms/rejects.
2.  **Privacy:** Reservations are private. `diner` sees only theirs, `owner` sees only theirs (via claimed restaurant ID).
3.  **Capacity (Warning Only):** System calculates `bookableTables * seatsPerTable` vs active reservations for that slot. If exceeded, warns user but allows booking (soft limit).
4.  **Plan Limits:** Owner's subscription tier dictates max reservations/month. See `src/lib/plan-limits.ts`.
5.  **Notifications:** Currently in-app only via status updates.

### 🛡️ Auth & Access
1.  **Role Guard:** `src/components/RoleGuard.tsx` protects routes.
    -   `diner` trying to access `owner` routes -> Redirects to Search.
    -   `owner` trying to access `diner` routes -> Redirects to Dashboard.
2.  **Redirects:** `src/components/navigation/AuthRedirect.tsx` handles post-login routing.

---

## 4. Reusable UI Components (Design System)

**Global Styles (`globals.css`):**
-   **Primary Color:** HSL `158 64% 39%` (Green/Teal).
-   **Radius:** `0.5rem` (Rounded-md).

**Key Components (`src/components/ui`):**
-   `Button`: Variants: `default` (Primary), `secondary`, `destructive`, `outline`, `ghost`.
-   `Card`: Use `Card`, `CardHeader`, `CardContent`, `CardFooter` for all containers.
-   `Dialog` / `Sheet`: For modals and drawers.
-   `Badge`: Use `PremiumBadge` for tier indication.

**Icons:** Use `lucide-react`.

---

## 5. State Management Patterns
1.  **Server State:** `React Query` (via `src/components/query-provider.tsx`).
    -   Used for: Search results, Profile data, Subscription status.
2.  **Client State:** `Zustand` (`src/store/place-store.ts`).
    -   Used for: `selectedPlace` (Modal/Lightbox state).
3.  **Form State:** Controlled inputs + `React Hook Form` (if complex) or simple state.

---

## 6. Known Issues & "DO NOT DO" List
-   ❌ **DO NOT** use `auth.currentUser` to validate admin/owner actions on the server. **ALWAYS** use `getAdminAuth()` and verify the token.
-   ❌ **DO NOT** create new `places` API routes without checking `src/lib/restaurant-cache.ts` first. All reads MUST try cache properties.
-   ⚠️ **WARNING:** `src/app/api/checkout/route.ts` creates generic sessions. It **DOES NOT** currently accept/pass `placeId`. **Claiming logic relies on the Webhook receiving this metadata, so if the Checkout API doesn't pass it, claiming fails.**
-   ❌ **DO NOT** use Stripe Product IDs (`prod_...`) in `src/lib/plan-limits.ts`. The Checkout API and Webhooks require **Price IDs** (`price_...`). Using Product IDs will cause 500 API errors and failed role mapping.
-   ⚠️ **WARNING:** Google Places V2 IDs are used. Do not mix with V1 (deprecated).
