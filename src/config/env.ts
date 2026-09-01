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
};
