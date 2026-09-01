import { Router } from "express";
import { z } from "zod";
import * as controller from "./business.controller";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";

const router = Router();
router.use(requireAuth, requireRole("BUSINESS"));

const updateBusinessSchema = z.object({
  name: z.string().min(2).optional(),
  logoUrl: z.string().url().optional(),
  qrMode: z.enum(["DYNAMIC_STAFF", "STATIC_GEOFENCE"]).optional(),
  loyaltyRule: z
    .object({
      stampsRequired: z.number().int().min(1).max(50).optional(),
      rewardDescription: z.string().min(1).optional(),
      stampCooldownHours: z.number().min(0).optional(),
      stampTokenTtlSeconds: z.number().min(30).optional(),
    })
    .optional(),
});

const branchSchema = z.object({
  name: z.string().min(2),
  address: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

const branchUpdateSchema = branchSchema.partial().extend({ isActive: z.boolean().optional() });

const staffSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  branchId: z.string().optional(),
});

const generateQrSchema = z.object({
  branchId: z.string().min(10),
  amountPaid: z.number().nonnegative().optional(),
});

const manualAdjustSchema = z.object({
  customerId: z.string().min(10),
  branchId: z.string().min(10),
  direction: z.enum(["ADD", "REMOVE"]),
  reason: z.string().max(200).optional(),
});

const verifyRedemptionSchema = z.object({
  redemptionCode: z.string().length(6),
});

router.get("/me", controller.getMyBusiness);
router.patch("/me", validateBody(updateBusinessSchema), controller.updateMyBusiness);

router.post("/branches", validateBody(branchSchema), controller.addBranch);
router.patch("/branches/:id", validateBody(branchUpdateSchema), controller.updateBranch);

router.post("/staff", validateBody(staffSchema), controller.inviteStaff);

router.post("/qr/generate", validateBody(generateQrSchema), controller.generateQr);

router.get("/customers", controller.listCustomers);
router.get("/customers/:customerId", controller.getCustomerDetail);

router.post("/stamps/manual-adjust", validateBody(manualAdjustSchema), controller.manualAdjustStamp);
router.post("/redemptions/verify", validateBody(verifyRedemptionSchema), controller.verifyRedemption);

router.get("/analytics", controller.myAnalytics);

export default router;
