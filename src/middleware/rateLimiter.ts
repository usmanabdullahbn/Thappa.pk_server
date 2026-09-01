import rateLimit from "express-rate-limit";

// Protects OTP / login endpoints from brute-force and OTP-bombing abuse.
export const authRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many attempts, please wait a moment" } },
});

// Protects the scan-to-earn endpoint from stamp-farming / automated abuse.
export const scanRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many scan attempts, please slow down" } },
});
