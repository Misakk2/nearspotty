import { initializeApp, getApps, getApp, cert, ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const serviceAccountKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

let adminApp;

if (!getApps().length) {
    if (serviceAccountKey) {
        // If we have a service account key (local dev usage usually), use it.
        // Assuming FIREBASE_ADMIN_PRIVATE_KEY contains the JSON string of the service account
        try {
            const serviceAccount = JSON.parse(serviceAccountKey) as ServiceAccount;
            adminApp = initializeApp({
                credential: cert(serviceAccount),
            });
        } catch (e) {
            console.error("Failed to parse FIREBASE_ADMIN_PRIVATE_KEY", e);
            // Fallback to default creds or empty init which works in Cloud Functions environment automatically
            adminApp = initializeApp();
        }
    } else {
        // In Cloud Functions or if no key provided, let Firebase Admin discover credentials 
        // (GOOGLE_APPLICATION_CREDENTIALS or metadata server)
        adminApp = initializeApp();
    }
} else {
    adminApp = getApp();
}

const adminDb = getFirestore(adminApp);
const adminAuth = getAuth(adminApp);

export { adminApp, adminDb, adminAuth };
