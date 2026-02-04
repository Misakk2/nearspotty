import { initializeApp, getApps, getApp, cert, ServiceAccount, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";

// --- Development Emulators Setup (Must be before initialization) ---
if (process.env.NODE_ENV === "development") {
    const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
    const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
    const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST || "127.0.0.1:9199";

    if (!process.env.FIRESTORE_EMULATOR_HOST) {
        process.env.FIRESTORE_EMULATOR_HOST = firestoreHost;
        console.log(`[Firebase Admin] Firestore Emulator: ${firestoreHost}`);
    }
    if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
        process.env.FIREBASE_AUTH_EMULATOR_HOST = authHost;
        console.log(`[Firebase Admin] Auth Emulator: ${authHost}`);
    }
    if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
        process.env.FIREBASE_STORAGE_EMULATOR_HOST = storageHost;
        console.log(`[Firebase Admin] Storage Emulator: ${storageHost}`);
    }
}

// --- Configuration ---
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "nearspotty-dev";
const privateKey = process.env.FIREBASE_PRIVATE_KEY;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

// Support legacy JSON key if still present (backwards compatibility)
const serviceAccountKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

function initAdmin(): App {
    if (getApps().length) {
        return getApp();
    }

    // 1. Explicit Key (Preferred for Production w/ Secrets)
    if (privateKey && clientEmail) {
        try {
            // Fix for multiline private keys from env vars
            const formattedKey = privateKey.replace(/\\n/g, '\n');

            return initializeApp({
                credential: cert({
                    projectId,
                    clientEmail,
                    privateKey: formattedKey,
                }),
                projectId
            });
        } catch (error) {
            console.error("[Firebase Admin] Failed to init with explicit keys:", error);
        }
    }

    // 2. Legacy JSON Key (Backward Compatibility)
    if (serviceAccountKey) {
        try {
            const serviceAccount = JSON.parse(serviceAccountKey) as ServiceAccount;
            return initializeApp({
                credential: cert(serviceAccount),
                projectId
            });
        } catch (error) {
            console.warn("[Firebase Admin] Legacy JSON Parse Failed:", error);
        }
    }

    // 3. ADC / Emulator (Default Fallback)
    // Works automatically in Google Cloud Functions & App Hosting
    return initializeApp({ projectId });
}

const adminApp = initAdmin();

const adminDb = getFirestore(adminApp);
const adminAuth = getAuth(adminApp);
// AdminDB settings
adminDb.settings({ ignoreUndefinedProperties: true });

const adminStorage = getStorage(adminApp);

export { adminApp, adminDb, adminAuth, adminStorage };
