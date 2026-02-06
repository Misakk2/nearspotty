/**
 * Firebase Admin SDK - Lazy Loading Singleton Pattern
 * 
 * CRITICAL: All exports are functions that initialize on first call.
 * This prevents Next.js server crashes when secrets are temporarily unavailable.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { initializeApp, getApps, getApp, App, applicationDefault } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getAuth, Auth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";

// --- Configuration ---
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "nearspotty-13f22";

// --- 1. Detect Environment ---
const isEmulator =
    process.env.NODE_ENV === "development" &&
    (!!process.env.FIREBASE_STORAGE_EMULATOR_HOST || process.env.NEXT_PUBLIC_USE_EMULATORS === "true");

// --- 2. Setup Emulator Variables (Before Init) - Only runs once ---
let emulatorConfigured = false;
function configureEmulators() {
    if (emulatorConfigured || !isEmulator) return;
    emulatorConfigured = true;

    const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
    const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
    const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST || "127.0.0.1:9199";

    if (!process.env.FIRESTORE_EMULATOR_HOST) {
        process.env.FIRESTORE_EMULATOR_HOST = firestoreHost;
        console.log(`[Firebase Admin] 🔧 Firestore Emulator: ${firestoreHost}`);
    }
    if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
        process.env.FIREBASE_AUTH_EMULATOR_HOST = authHost;
        console.log(`[Firebase Admin] 🔧 Auth Emulator: ${authHost}`);
    }
    if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
        process.env.FIREBASE_STORAGE_EMULATOR_HOST = storageHost;
        console.log(`[Firebase Admin] 🔧 Storage Emulator: ${storageHost}`);
    }
}

// --- 3. Lazy Singleton Pattern ---
let _adminApp: App | null = null;
let _adminDb: Firestore | null = null;
let _adminAuth: Auth | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminStorage: any = null;
let _initError: Error | null = null;
let _dbSettingsApplied = false;

/**
 * Get Firebase Admin App instance (Lazy Initialization)
 * @throws Error if initialization fails
 */
export function getAdminApp(): App {
    if (_initError) throw _initError;
    if (_adminApp) return _adminApp;

    try {
        configureEmulators();

        const validApps = getApps();
        if (validApps.length) {
            console.log(`[Firebase Admin] 🔄 Reuse existing Admin instance. Found: ${validApps.map(a => a.name).join(', ')}`);
            _adminApp = validApps.find(a => a.name === '[DEFAULT]') || validApps[0];
            return _adminApp;
        }

        const finalProjectId = projectId || process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
        const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

        if (!finalProjectId) {
            throw new Error("CRITICAL: No Firebase Project ID in environment!");
        }

        // --- Emulator Mode ---
        if (isEmulator) {
            console.log(`[Firebase Admin] 🚀 Initializing in EMULATOR Mode for Project: ${finalProjectId}`);
            _adminApp = initializeApp({
                projectId: finalProjectId,
                storageBucket: storageBucket
            });
            return _adminApp;
        }

        // --- Production Mode (ADC) ---
        console.log(`[Firebase Admin] ☁️ Initializing with ADC for Project: ${finalProjectId}`);

        const appOptions = {
            projectId: finalProjectId,
            storageBucket: storageBucket,
            credential: applicationDefault()
        };

        _adminApp = initializeApp(appOptions);
        return _adminApp;

    } catch (error) {
        _initError = error as Error;
        console.error("[Firebase Admin] ❌ Initialization failed:", error);
        throw error;
    }
}

/**
 * Get Firestore instance (Lazy Initialization)
 */
export function getAdminDb(): Firestore {
    if (_adminDb) return _adminDb;

    const app = getAdminApp();
    _adminDb = getFirestore(app);

    // Apply settings only once
    if (!_dbSettingsApplied) {
        try {
            _adminDb.settings({ ignoreUndefinedProperties: true });
            _dbSettingsApplied = true;
        } catch {
            // Settings already locked - this is fine during hot reload
        }
    }

    return _adminDb;
}

/**
 * Get Auth instance (Lazy Initialization)
 */
export function getAdminAuth(): Auth {
    if (_adminAuth) return _adminAuth;
    _adminAuth = getAuth(getAdminApp());
    return _adminAuth;
}

/**
 * Get Storage instance (Lazy Initialization)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAdminStorage(): any {
    if (_adminStorage) return _adminStorage;
    _adminStorage = getStorage(getAdminApp());
    return _adminStorage;
}
