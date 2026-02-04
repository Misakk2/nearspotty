import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { connectFirestoreEmulator, initializeFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

const auth = getAuth(app);

// For Safari compatibility with Firestore emulators
const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});

const functions = getFunctions(app);
const storage = getStorage(app);

if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  const host = window.location.hostname;
  try {
    // Only connect if not already connected
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
    console.log(`Connected to emulators at ${host}`);
  } catch (e) {
    console.log("Emulators already connected or failed to connect", e);
  }
}

export { app, auth, db, functions, storage };
