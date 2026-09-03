import dotenv from "dotenv";
dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: parseInt(process.env.PORT || "4000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",

  mongodbUri: required("MONGODB_URI", "mongodb://127.0.0.1:27017/thappa"),

  jwtAccessSecret: required("JWT_ACCESS_SECRET", "dev_access_secret"),
  jwtRefreshSecret: required("JWT_REFRESH_SECRET", "dev_refresh_secret"),
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",

  qrSigningSecret: required("QR_SIGNING_SECRET", "dev_qr_secret"),
  qrTokenTtlSeconds: parseInt(process.env.QR_TOKEN_TTL_SECONDS || "300", 10),

  seedAdminEmail: process.env.SEED_ADMIN_EMAIL || "admin@thappa.in",
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!",
  seedAdminName: process.env.SEED_ADMIN_NAME || "Thappa Admin",

  // Google Sign-In: verifies the ID token the mobile app gets from
  // expo-auth-session. Unset in dev until you create an OAuth client.
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",

  // Firebase Admin: verifies the ID token the mobile app gets after a real
  // Firebase Phone Auth SMS round-trip. All three must be set together for
  // real SMS OTP to activate; otherwise auth falls back to the console-logged
  // dev OTP (see utils/otpStore.ts).
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || "",
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL || "",
  firebasePrivateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),

  // Expo push notifications: no account/secret needed for Expo's push
  // service itself, just a valid Expo push token per device (registered by
  // the mobile app after login).
  expoAccessToken: process.env.EXPO_ACCESS_TOKEN || "",
};

export const firebaseConfigured = !!(env.firebaseProjectId && env.firebaseClientEmail && env.firebasePrivateKey);
export const googleSignInConfigured = !!env.googleClientId;
