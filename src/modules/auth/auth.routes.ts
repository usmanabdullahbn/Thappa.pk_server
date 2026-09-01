import { Router } from "express";
import { z } from "zod";
import * as controller from "./auth.controller";
import { validateBody } from "../../middleware/validate";
import { requireAuth } from "../../middleware/auth";
import { authRateLimiter } from "../../middleware/rateLimiter";

const router = Router();

const phoneSchema = z.object({ phone: z.string().min(7).max(16) });
const verifyOtpSchema = z.object({
  phone: z.string().min(7).max(16),
  otp: z.string().length(4),
  name: z.string().optional(),
});
const googleSchema = z.object({ email: z.string().email(), name: z.string().min(1) });
const passwordLoginSchema = z.object({ email: z.string().email(), password: z.string().min(6) });
const refreshSchema = z.object({ refreshToken: z.string().min(10) });

router.post("/otp/send", authRateLimiter, validateBody(phoneSchema), controller.sendOtp);
router.post("/otp/verify", authRateLimiter, validateBody(verifyOtpSchema), controller.verifyOtpAndLogin);
router.post("/google", authRateLimiter, validateBody(googleSchema), controller.googleSignIn);
router.post("/business-login", authRateLimiter, validateBody(passwordLoginSchema), controller.businessLogin);
router.post("/admin-login", authRateLimiter, validateBody(passwordLoginSchema), controller.adminLogin);
router.post("/refresh", validateBody(refreshSchema), controller.refresh);
router.post("/logout", requireAuth, controller.logout);
router.get("/me", requireAuth, controller.me);

export default router;
