import { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler, ApiError } from "../../middleware/errorHandler";
import { Business } from "../../models/Business";
import { Branch } from "../../models/Branch";
import { StampCard } from "../../models/StampCard";
import { StampTransaction } from "../../models/StampTransaction";
import { Redemption } from "../../models/Redemption";
import { User } from "../../models/User";
import { generateSixDigitCode } from "../../utils/sixDigitCode";
import { generateStampQr } from "../qr/qr.service";
import { hashPassword } from "../auth/auth.service";

async function getOwnBusinessOrThrow(businessId?: string) {
  if (!businessId) throw new ApiError(403, "NO_BUSINESS", "This login is not attached to a business");
  const business = await Business.findById(businessId);
  if (!business) throw new ApiError(404, "NOT_FOUND", "Business not found");
  return business;
}

export const getMyBusiness = asyncHandler(async (req: Request, res: Response) => {
  const business = await getOwnBusinessOrThrow(req.user!.businessId);
  const branches = await Branch.find({ businessId: business._id });
  res.json({ business, branches });
});

export const updateMyBusiness = asyncHandler(async (req: Request, res: Response) => {
  const business = await getOwnBusinessOrThrow(req.user!.businessId);
  const { name, logoUrl, loyaltyRule, qrMode } = req.body as {
    name?: string;
    logoUrl?: string;
    loyaltyRule?: Partial<{ stampsRequired: number; rewardDescription: string; stampCooldownHours: number; stampTokenTtlSeconds: number }>;
    qrMode?: "DYNAMIC_STAFF" | "STATIC_GEOFENCE";
  };

  if (name) business.name = name;
  if (logoUrl) business.logoUrl = logoUrl;
  if (qrMode) business.qrMode = qrMode;
  if (loyaltyRule) business.loyaltyRule = { ...business.loyaltyRule, ...loyaltyRule };

  await business.save();
  res.json({ business });
});

export const addBranch = asyncHandler(async (req: Request, res: Response) => {
  const business = await getOwnBusinessOrThrow(req.user!.businessId);
  const { name, address, lat, lng } = req.body as { name: string; address?: string; lat?: number; lng?: number };

  const branch = await Branch.create({
    businessId: business._id,
    name,
    address,
    location: { type: "Point", coordinates: [lng ?? 0, lat ?? 0] },
    staffUserIds: [req.user!.userId],
  });

  res.status(201).json({ branch });
});

export const updateBranch = asyncHandler(async (req: Request, res: Response) => {
  await getOwnBusinessOrThrow(req.user!.businessId);
  const { name, address, lat, lng, isActive } = req.body as {
    name?: string;
    address?: string;
    lat?: number;
    lng?: number;
    isActive?: boolean;
  };

  const branch = await Branch.findOne({ _id: req.params.id, businessId: req.user!.businessId });
  if (!branch) throw new ApiError(404, "NOT_FOUND", "Branch not found");

  if (name) branch.name = name;
  if (address !== undefined) branch.address = address;
  if (isActive !== undefined) branch.isActive = isActive;
  if (lat !== undefined && lng !== undefined) branch.location = { type: "Point", coordinates: [lng, lat] };

  await branch.save();
  res.json({ branch });
});

export const inviteStaff = asyncHandler(async (req: Request, res: Response) => {
  const business = await getOwnBusinessOrThrow(req.user!.businessId);
  const { name, email, password, branchId } = req.body as {
    name: string;
    email: string;
    password: string;
    branchId?: string;
  };

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) throw new ApiError(409, "EMAIL_TAKEN", "An account with this email already exists");

  const passwordHash = await hashPassword(password);
  const staff = await User.create({
    role: "BUSINESS",
    name,
    email: email.toLowerCase(),
    authProvider: "PASSWORD",
    passwordHash,
    businessId: business._id,
    branchId: branchId || undefined,
  });

  if (branchId) {
    await Branch.findByIdAndUpdate(branchId, { $addToSet: { staffUserIds: staff._id } });
  }

  res.status(201).json({ staff: { id: staff._id, name: staff.name, email: staff.email } });
});

export const generateQr = asyncHandler(async (req: Request, res: Response) => {
  await getOwnBusinessOrThrow(req.user!.businessId);
  const { branchId, amountPaid } = req.body as { branchId: string; amountPaid?: number };

  const branch = await Branch.findOne({ _id: branchId, businessId: req.user!.businessId });
  if (!branch) throw new ApiError(404, "NOT_FOUND", "Branch not found for this business");

  const result = await generateStampQr({ branchId, staffUserId: req.user!.userId, amountPaid });
  res.json({
    qrToken: result.qrToken,
    qrImageBase64: result.qrImageDataUrl,
    expiresAt: result.expiresAt,
    nonce: result.nonce,
  });
});

export const listCustomers = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt((req.query.page as string) || "1", 10);
  const limit = parseInt((req.query.limit as string) || "20", 10);
  const search = (req.query.search as string) || "";

  const matchStage: Record<string, unknown> = { businessId: new mongoose.Types.ObjectId(req.user!.businessId) };

  const cards = await StampCard.find(matchStage)
    .sort({ lastStampAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate("customerId", "name phone email profileImageUrl");

  const totalCount = await StampCard.countDocuments(matchStage);

  const filtered = search
    ? cards.filter((c: any) => c.customerId?.name?.toLowerCase().includes(search.toLowerCase()))
    : cards;

  res.json({ data: filtered, page, totalPages: Math.ceil(totalCount / limit), totalCount });
});

export const getCustomerDetail = asyncHandler(async (req: Request, res: Response) => {
  const card = await StampCard.findOne({
    customerId: req.params.customerId,
    businessId: req.user!.businessId,
  }).populate("customerId", "name phone email profileImageUrl");
  if (!card) throw new ApiError(404, "NOT_FOUND", "No stamp card for this customer at your business");

  const transactions = await StampTransaction.find({ stampCardId: card._id }).sort({ createdAt: -1 }).limit(50);
  const redemptions = await Redemption.find({ stampCardId: card._id }).sort({ createdAt: -1 });

  res.json({ card, transactions, redemptions });
});

export const manualAdjustStamp = asyncHandler(async (req: Request, res: Response) => {
  const { customerId, branchId, direction, reason } = req.body as {
    customerId: string;
    branchId: string;
    direction: "ADD" | "REMOVE";
    reason?: string;
  };

  const branch = await Branch.findOne({ _id: branchId, businessId: req.user!.businessId });
  if (!branch) throw new ApiError(404, "NOT_FOUND", "Branch not found for this business");

  const business = await Business.findById(req.user!.businessId);
  if (!business) throw new ApiError(404, "NOT_FOUND", "Business not found");

  let card = await StampCard.findOne({ customerId, branchId });
  if (!card) {
    card = await StampCard.create({
      customerId,
      businessId: business._id,
      branchId,
      currentStamps: 0,
      stampsRequired: business.loyaltyRule.stampsRequired,
    });
  }

  if (direction === "ADD") {
    card.currentStamps += 1;
    card.totalStampsEarnedLifetime += 1;
  } else {
    card.currentStamps = Math.max(0, card.currentStamps - 1);
  }
  await card.save();

  await StampTransaction.create({
    stampCardId: card._id,
    customerId,
    businessId: business._id,
    branchId,
    type: direction === "ADD" ? "MANUAL_ADJUST_ADD" : "MANUAL_ADJUST_REMOVE",
    performedByStaffId: req.user!.userId,
    amountPaid: undefined,
    deviceId: reason, // reusing field loosely for a short note in this MVP
  });

  res.json({ card });
});

export const verifyRedemption = asyncHandler(async (req: Request, res: Response) => {
  const { redemptionCode } = req.body as { redemptionCode: string };

  const redemption = await Redemption.findOne({
    redemptionCode,
    businessId: req.user!.businessId,
    status: "PENDING",
  });
  if (!redemption) throw new ApiError(404, "NOT_FOUND", "No pending redemption with this code");

  redemption.status = "REDEEMED";
  redemption.redeemedAt = new Date();
  redemption.redeemedByStaffId = req.user!.userId as any;
  await redemption.save();

  res.json({ redemption });
});

export const myAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const businessId = new mongoose.Types.ObjectId(req.user!.businessId);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [stampsLast30d, redemptionsLast30d, totalCustomers] = await Promise.all([
    StampTransaction.countDocuments({ businessId, type: "EARN", createdAt: { $gte: since } }),
    Redemption.countDocuments({ businessId, status: "REDEEMED", createdAt: { $gte: since } }),
    StampCard.countDocuments({ businessId }),
  ]);

  res.json({ stampsLast30d, redemptionsLast30d, totalCustomers });
});
