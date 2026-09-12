import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { User, IUser } from "../../models/User";
import { signAccessToken, signRefreshToken } from "../../utils/jwt";
import { issueOtp, verifyOtp } from "../../utils/otpStore";
import { verifyFirebaseIdToken } from "../../utils/firebaseAdmin";
import { ApiError } from "../../middleware/errorHandler";
import { env, googleSignInConfigured } from "../../config/env";

const googleClient = new OAuth2Client(env.googleClientId || undefined);

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

/**
 * Dev-mode OTP: logs the code to the console instead of sending real SMS.
 * Used by the mobile app only when Firebase isn't configured (see
 * firebasePhoneLogin below for the real-SMS production path).
 */
export async function sendPhoneOtp(phone: string): Promise<void> {
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
 * Verifies a Google ID token (obtained by the mobile app via expo-auth-session)
 * server-side before ever trusting the email/name it carries.
 */
export async function googleSignIn(idToken: string) {
  if (!googleSignInConfigured) {
    throw new ApiError(500, "GOOGLE_NOT_CONFIGURED", "Google Sign-In is not configured on the server yet");
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: env.googleClientId });
    payload = ticket.getPayload();
  } catch {
    throw new ApiError(401, "INVALID_GOOGLE_TOKEN", "Could not verify this Google sign-in");
  }
  if (!payload?.email || !payload.email_verified) {
    throw new ApiError(401, "INVALID_GOOGLE_TOKEN", "Google account has no verified email");
  }

  const email = payload.email.toLowerCase();
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      role: "CUSTOMER",
      name: payload.name || "Thappa Customer",
      email,
      profileImageUrl: payload.picture,
      authProvider: "GOOGLE",
    });
  }
  if (!user.isActive) {
    throw new ApiError(403, "ACCOUNT_DISABLED", "This account has been disabled");
  }
  return { user, tokens: issueTokenPair(user) };
}

/**
 * Verifies a Firebase ID token obtained after a real Phone Auth SMS
 * round-trip on the client, and finds-or-creates the CUSTOMER user by the
 * verified phone number. This is the production path for sendPhoneOtp/
 * verifyPhoneOtpAndLogin above, active once FIREBASE_* env vars are set.
 */
export async function firebasePhoneLogin(idToken: string, name?: string) {
  let decoded;
  try {
    decoded = await verifyFirebaseIdToken(idToken);
  } catch {
    throw new ApiError(401, "INVALID_FIREBASE_TOKEN", "Could not verify this sign-in");
  }
  const phone = decoded.phone_number;
  if (!phone) {
    throw new ApiError(401, "INVALID_FIREBASE_TOKEN", "Token has no verified phone number");
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

/** Email+password sign-up for CUSTOMER accounts created from the mobile app. */
export async function customerSignup(input: { name: string; phone: string; email: string; password: string }) {
  const email = input.email.toLowerCase();
  const existing = await User.findOne({ $or: [{ email }, { phone: input.phone }] });
  if (existing) {
    const field = existing.email === email ? "email" : "phone number";
    throw new ApiError(409, "ACCOUNT_EXISTS", `An account with this ${field} already exists. Please sign in instead.`);
  }

  const user = await User.create({
    role: "CUSTOMER",
    name: input.name,
    email,
    phone: input.phone,
    authProvider: "PASSWORD",
    passwordHash: await hashPassword(input.password),
  });
  return { user, tokens: issueTokenPair(user) };
}

/**
 * Email+password login for CUSTOMER accounts. Returns 404 for an unknown email
 * so the mobile app can point the customer to sign-up.
 */
export async function customerLogin(email: string, password: string) {
  const user = await User.findOne({ email: email.toLowerCase(), role: "CUSTOMER" }).select("+passwordHash");
  if (!user) {
    throw new ApiError(404, "ACCOUNT_NOT_FOUND", "No account found with this email");
  }
  if (!user.passwordHash) {
    throw new ApiError(
      401,
      "PASSWORD_NOT_SET",
      user.authProvider === "GOOGLE"
        ? "This account uses Google sign-in. Tap “Continue with Google” instead."
        : "This account doesn’t have a password yet."
    );
  }
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
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
