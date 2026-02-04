declare namespace NodeJS {
    interface ProcessEnv {
        // Firebase
        NEXT_PUBLIC_FIREBASE_API_KEY: string;
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: string;
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: string;
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: string;
        NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: string;
        NEXT_PUBLIC_FIREBASE_APP_ID: string;
        NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: string;

        // Google Maps
        NEXT_PUBLIC_GOOGLE_MAPS_KEY: string;
        NEXT_PUBLIC_GOOGLE_MAP_ID: string;

        // Server-side Secrets
        GEMINI_API_KEY: string;
        STRIPE_SECRET_KEY: string;
        STRIPE_WEBHOOK_SECRET: string;
    }
}
