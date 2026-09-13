import { Router } from "express";
import { z } from "zod";
import * as controller from "./admin.controller";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";

const router = Router();
router.use(requireAuth, requireRole("ADMIN"));

const createBusinessSchema = z.object({
  businessName: z.string().min(2),
  category: z.enum(["CAFE", "RESTAURANT", "SALON", "GYM", "OTHER"]).optional(),
  ownerName: z.string().min(2),
  ownerEmail: z.string().email(),
  ownerPassword: z.string().min(6),
  branchName: z.string().min(2).optional(),
  branchAddress: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

const statusSchema = z.object({
  status: z.enum(["PENDING", "ACTIVE", "SUSPENDED", "CANCELLED"]),
});

const futureDateSchema = z
  .string()
  .datetime({ offset: true, message: "must be a valid date" })
  .refine((value) => new Date(value).getTime() > Date.now(), "must be in the future");

const createCampaignSchema = z.object({
  businessId: z.string().regex(/^[a-f\d]{24}$/i, "must be a valid business id"),
  headline: z.string().trim().min(3).max(80),
  description: z.string().trim().min(10).max(500),
  stampsRequired: z.number().int().min(1).max(50),
  rewardDescription: z.string().trim().min(2).max(120),
  expiresAt: futureDateSchema,
});

const campaignStatusSchema = z.object({ isActive: z.boolean() });
const campaignExpirySchema = z.object({ expiresAt: futureDateSchema });

router.post("/businesses", validateBody(createBusinessSchema), controller.createBusiness);
router.get("/businesses", controller.listBusinesses);
router.get("/businesses/:id", controller.getBusinessDetail);
router.patch("/businesses/:id/status", validateBody(statusSchema), controller.updateBusinessStatus);
router.get("/campaigns", controller.listCampaigns);
router.post("/campaigns", validateBody(createCampaignSchema), controller.createCampaign);
router.patch("/campaigns/:id/status", validateBody(campaignStatusSchema), controller.updateCampaignStatus);
router.patch("/campaigns/:id/expiry", validateBody(campaignExpirySchema), controller.updateCampaignExpiry);
router.get("/analytics/overview", controller.platformOverview);

export default router;
