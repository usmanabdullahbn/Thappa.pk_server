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

router.post("/businesses", validateBody(createBusinessSchema), controller.createBusiness);
router.get("/businesses", controller.listBusinesses);
router.get("/businesses/:id", controller.getBusinessDetail);
router.patch("/businesses/:id/status", validateBody(statusSchema), controller.updateBusinessStatus);
router.get("/analytics/overview", controller.platformOverview);

export default router;
