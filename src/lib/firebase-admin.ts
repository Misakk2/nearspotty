import { initializeApp, getApps, getApp, cert, ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const serviceAccountKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

let adminApp;

if (process.env.NODE_ENV === "development") {
    // If running in development and not already set, default to local emulator ports
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
        process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
        console.log("Admin SDK: Using Firestore Emulator at 127.0.0.1:8080");
    }
    if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
        // Force set for Next.js API routes in dev
        process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
        console.log("Admin SDK: Using Auth Emulator at 127.0.0.1:9099");
    }
}

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

if (!getApps().length) {
    if (serviceAccountKey) {
        try {
            const serviceAccount = JSON.parse(serviceAccountKey) as ServiceAccount;
            adminApp = initializeApp({
                credential: cert(serviceAccount),
                projectId: projectId,
            });
        } catch (e) {
            console.error("Failed to parse FIREBASE_ADMIN_PRIVATE_KEY", e);
            adminApp = initializeApp({ projectId });
        }
    } else {
        adminApp = initializeApp({ projectId });
    }
} else {
    adminApp = getApp();
}

const adminDb = getFirestore(adminApp);
const adminAuth = getAuth(adminApp);

export { adminApp, adminDb, adminAuth };
