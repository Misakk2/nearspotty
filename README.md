# NearSpotty

> "Find your perfect meal, matched to your diet"

NearSpotty is an AI-powered restaurant/service finder that matches users with nearby open businesses based on dietary preferences (vegan, vegetarian, lactose-free, gluten-free, etc.) using Gemini 3 for intelligent review analysis.

## Tech Stack

- **Framework**: Next.js 14
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Backend/Auth**: Firebase (Auth, Firestore, Functions)
- **AI**: Google Gemini Pro (Phase 3)
- **Maps**: Google Maps JavaScript API + Places API
- **Payments**: Stripe

## Getting Started

### 1. Prerequisites

- Node.js 18+
- Firebase Project
- Google Cloud Project (for Maps & Places)

### 2. Installation

Clone the repo and install dependencies:

```bash
npm install
```

### 3. Environment Variables

Copy `.env.example` to `.env` and fill in your API keys:

```bash
cp .env.example .env.local
```

Required keys:
- `NEXT_PUBLIC_FIREBASE_API_KEY`: From Firebase Console
- `NEXT_PUBLIC_GEMINI_API_KEY`: For AI features
- `NEXT_PUBLIC_GOOGLE_MAPS_KEY`: For Maps display

### 4. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Project Structure

- `src/app`: Next.js App Router pages
- `src/components`: React components
- `src/lib`: Utilities and Firebase config
- `src/backend`: (Future) Cloud Functions

## Deployment

Deploy to Firebase Hosting:

```bash
npm run build
firebase deploy
```
