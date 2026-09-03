import { Router } from "express";
import { z } from "zod";
import * as controller from "./customer.controller";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { scanRateLimiter } from "../../middleware/rateLimiter";

const router = Router();
router.use(requireAuth, requireRole("CUSTOMER"));

const updateMeSchema = z.object({
  name: z.string().min(1).optional(),
  profileImageUrl: z.string().url().optional(),
  expoPushToken: z.string().optional(),
});

const redeemQrSchema = z
  .object({
    qrToken: z.string().optional(),
    branchId: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
  })
  .refine((data) => data.qrToken || (data.branchId && data.lat !== undefined && data.lng !== undefined), {
    message: "Provide either qrToken or branchId+lat+lng",
  });

router.get("/me", controller.getMe);
router.patch("/me", validateBody(updateMeSchema), controller.updateMe);

router.get("/stamp-cards", controller.listStampCards);
router.get("/stamp-cards/:id", controller.getStampCardDetail);

router.post("/stamps/redeem-qr", scanRateLimiter, validateBody(redeemQrSchema), controller.redeemQr);
router.get("/rewards/:redemptionId", controller.getRedemptionCode);

router.get("/nearby-businesses", controller.nearbyBusinesses);

export default router;
