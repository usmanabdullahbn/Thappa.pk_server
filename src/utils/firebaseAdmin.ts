import admin from "firebase-admin";
import { env, firebaseConfigured } from "../config/env";

let app: admin.app.App | null = null;

function getApp(): admin.app.App {
  if (!firebaseConfigured) {
    throw new Error("Firebase is not configured (FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY missing)");
  }
  if (!app) {
    app = admin.apps.length
      ? (admin.apps[0] as admin.app.App)
      : admin.initializeApp({
          credential: admin.credential.cert({
            projectId: env.firebaseProjectId,
            clientEmail: env.firebaseClientEmail,
            privateKey: env.firebasePrivateKey,
          }),
        });
  }
  return app;
}

/** Verifies a Firebase ID token obtained by the mobile client after a real Phone Auth SMS round-trip. */
export async function verifyFirebaseIdToken(idToken: string) {
  return getApp().auth().verifyIdToken(idToken);
}
