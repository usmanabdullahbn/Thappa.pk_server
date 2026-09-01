import { Request, Response } from "express";
import { asyncHandler, ApiError } from "../../middleware/errorHandler";
import { User } from "../../models/User";
import * as authService from "./auth.service";
import { verifyRefreshToken, signAccessToken } from "../../utils/jwt";

function serializeUser(user: any) {
  return {
    id: user._id,
    role: user.role,
    name: user.name,
    email: user.email,
    phone: user.phone,
    businessId: user.businessId,
    branchId: user.branchId,
    profileImageUrl: user.profileImageUrl,
  };
}

export const sendOtp = asyncHandler(async (req: Request, res: Response) => {
  const { phone } = req.body as { phone: string };
  await authService.sendPhoneOtp(phone);
  res.json({ message: "OTP sent" });
});

export const verifyOtpAndLogin = asyncHandler(async (req: Request, res: Response) => {
  const { phone, otp, name } = req.body as { phone: string; otp: string; name?: string };
  const { user, tokens } = await authService.verifyPhoneOtpAndLogin(phone, otp, name);
  res.json({ user: serializeUser(user), ...tokens });
});

export const googleSignIn = asyncHandler(async (req: Request, res: Response) => {
  const { email, name } = req.body as { email: string; name: string };
  const { user, tokens } = await authService.googleSignIn(email, name);
  res.json({ user: serializeUser(user), ...tokens });
});

export const businessLogin = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };
  const { user, tokens } = await authService.passwordLogin(email, password, "BUSINESS");
  res.json({ user: serializeUser(user), ...tokens });
});

export const adminLogin = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };
  const { user, tokens } = await authService.passwordLogin(email, password, "ADMIN");
  res.json({ user: serializeUser(user), ...tokens });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken: string };
  if (!refreshToken) throw new ApiError(400, "MISSING_TOKEN", "refreshToken is required");

  let payload: { userId: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new ApiError(401, "INVALID_REFRESH_TOKEN", "Refresh token invalid or expired");
  }

  const user = await User.findById(payload.userId);
  if (!user || !user.isActive) {
    throw new ApiError(401, "INVALID_REFRESH_TOKEN", "User no longer active");
  }

  const accessToken = signAccessToken({
    userId: String(user._id),
    role: user.role,
    businessId: user.businessId ? String(user.businessId) : undefined,
    branchId: user.branchId ? String(user.branchId) : undefined,
  });

  res.json({ accessToken });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.userId);
  if (!user) throw new ApiError(404, "USER_NOT_FOUND", "User not found");
  res.json({ user: serializeUser(user) });
});

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  // Stateless JWT: client discards tokens. If you add a refresh-token
  // allowlist/blocklist collection later, revoke it here as well.
  res.json({ message: "Logged out" });
});
