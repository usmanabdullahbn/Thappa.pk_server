import bcrypt from "bcryptjs";
import { User, IUser } from "../../models/User";
import { signAccessToken, signRefreshToken } from "../../utils/jwt";
import { issueOtp, verifyOtp } from "../../utils/otpStore";
import { ApiError } from "../../middleware/errorHandler";

function issueTokenPair(user: IUser) {
  const accessToken = signAccessToken({
    userId: String(user._id),
    role: user.role,
    businessId: user.businessId ? String(user.businessId) : undefined,
    branchId: user.branchId ? String(user.branchId) : undefined,
  });
  const refreshToken = signRefreshToken({ userId: String(user._id) });
  return { accessToken, refreshToken };
}

/** Sends (logs, in dev) an OTP to a phone number for customer sign-in/up. */
export async function sendPhoneOtp(phone: string): Promise<void> {
  // TODO: swap for Firebase Phone Auth in production (client-side SDK sends
  // the SMS; backend only ever verifies the resulting Firebase ID token).
  issueOtp(phone);
}

/** Verifies the OTP and finds-or-creates a CUSTOMER user. */
export async function verifyPhoneOtpAndLogin(phone: string, otp: string, name?: string) {
  const ok = verifyOtp(phone, otp);
  if (!ok) {
    throw new ApiError(400, "INVALID_OTP", "Incorrect or expired OTP");
  }

  let user = await User.findOne({ phone });
  if (!user) {
    user = await User.create({
      role: "CUSTOMER",
      name: name || "Thappa Customer",
      phone,
      authProvider: "PHONE_OTP",
    });
  }
  if (!user.isActive) {
    throw new ApiError(403, "ACCOUNT_DISABLED", "This account has been disabled");
  }

  return { user, tokens: issueTokenPair(user) };
}

/**
 * Dev-mode Google sign-in stub: accepts a { email, name } "profile" the client
 * already obtained from Google Sign-In SDK. In production this must instead
 * take a Google ID token and verify it server-side (Firebase Admin SDK /
 * google-auth-library) before ever trusting the email — never trust a raw
 * client-submitted email/name pair like this in production.
 */
export async function googleSignIn(email: string, name: string) {
  let user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    user = await User.create({
      role: "CUSTOMER",
      name,
      email: email.toLowerCase(),
      authProvider: "GOOGLE",
    });
  }
  if (!user.isActive) {
    throw new ApiError(403, "ACCOUNT_DISABLED", "This account has been disabled");
  }
  return { user, tokens: issueTokenPair(user) };
}

/** Email+password login shared by BUSINESS and ADMIN roles. */
export async function passwordLogin(email: string, password: string, expectedRole: "BUSINESS" | "ADMIN") {
  const user = await User.findOne({ email: email.toLowerCase(), role: expectedRole }).select("+passwordHash");
  if (!user || !user.passwordHash) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }
  if (!user.isActive) {
    throw new ApiError(403, "ACCOUNT_DISABLED", "This account has been suspended. Contact Thappa support.");
  }
  return { user, tokens: issueTokenPair(user) };
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}
