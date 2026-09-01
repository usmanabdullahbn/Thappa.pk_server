import { generateFourDigitOtp } from "./sixDigitCode";

interface OtpEntry {
  otp: string;
  expiresAt: number;
  attempts: number;
}

// NOTE: This is a simple in-memory store suitable for local dev / demo only.
// It resets on server restart and won't work across multiple server instances.
// In production, replace with Firebase Phone Auth (client-side) + Firebase
// Admin SDK verification, or Redis-backed OTP storage + Twilio/MSG91.
const store = new Map<string, OtpEntry>();

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

export function issueOtp(phone: string): string {
  const otp = generateFourDigitOtp();
  store.set(phone, { otp, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });
  // eslint-disable-next-line no-console
  console.log(`[otp] ${phone} -> ${otp} (dev-mode: printed to console instead of SMS)`);
  return otp;
}

export function verifyOtp(phone: string, submittedOtp: string): boolean {
  const entry = store.get(phone);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    store.delete(phone);
    return false;
  }
  entry.attempts += 1;
  if (entry.attempts > MAX_ATTEMPTS) {
    store.delete(phone);
    return false;
  }
  const ok = entry.otp === submittedOtp;
  if (ok) store.delete(phone);
  return ok;
}
