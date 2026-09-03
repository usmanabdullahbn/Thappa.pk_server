import { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler, ApiError } from "../../middleware/errorHandler";
import { User } from "../../models/User";
import { Business } from "../../models/Business";
import { Branch } from "../../models/Branch";
import { StampCard } from "../../models/StampCard";
import { StampTransaction } from "../../models/StampTransaction";
import { Redemption } from "../../models/Redemption";
import { QrToken } from "../../models/QrToken";
import { generateSixDigitCode } from "../../utils/sixDigitCode";
import { haversineDistanceMeters } from "../../utils/haversine";
import { verifyStampQrToken } from "../qr/qr.service";
import { sendPushNotification } from "../../utils/push";

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.userId);
  if (!user) throw new ApiError(404, "NOT_FOUND", "User not found");
  res.json({ user });
});

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const { name, profileImageUrl, expoPushToken } = req.body as {
    name?: string;
    profileImageUrl?: string;
    expoPushToken?: string;
  };
  const user = await User.findById(req.user!.userId);
  if (!user) throw new ApiError(404, "NOT_FOUND", "User not found");
  if (name) user.name = name;
  if (profileImageUrl) user.profileImageUrl = profileImageUrl;
  if (expoPushToken) user.expoPushToken = expoPushToken;
  await user.save();
  res.json({ user });
});

export const listStampCards = asyncHandler(async (req: Request, res: Response) => {
  const cards = await StampCard.find({ customerId: req.user!.userId })
    .sort({ updatedAt: -1 })
    .populate("businessId", "name logoUrl category")
    .populate("branchId", "name address");
  res.json({ data: cards });
});

export const getStampCardDetail = asyncHandler(async (req: Request, res: Response) => {
  const card = await StampCard.findOne({ _id: req.params.id, customerId: req.user!.userId })
    .populate("businessId", "name logoUrl category")
    .populate("branchId", "name address");
  if (!card) throw new ApiError(404, "NOT_FOUND", "Stamp card not found");

  const transactions = await StampTransaction.find({ stampCardId: card._id }).sort({ createdAt: -1 }).limit(50);
  res.json({ card, transactions });
});

/**
 * Core scan-to-earn endpoint. Supports both QR modes documented in the
 * Technical Guide §5:
 *  - Mode A (DYNAMIC_STAFF): body = { qrToken }
 *  - Mode B (STATIC_GEOFENCE): body = { branchId, lat, lng }
 */
export const redeemQr = asyncHandler(async (req: Request, res: Response) => {
  const { qrToken, branchId: staticBranchId, lat, lng } = req.body as {
    qrToken?: string;
    branchId?: string;
    lat?: number;
    lng?: number;
  };

  const customerId = req.user!.userId;
  let branch;
  let business;
  let qrTokenNonce: string | undefined;
  let amountPaid: number | undefined;

  if (qrToken) {
    // ---- Mode A: signed, single-use, short-lived token ----
    const payload = verifyStampQrToken(qrToken);

    const tokenDoc = await QrToken.findOne({ nonce: payload.nonce });
    if (!tokenDoc || tokenDoc.status !== "ISSUED") {
      throw new ApiError(409, "QR_ALREADY_USED", "This QR code has already been used or was revoked");
    }

    const existingTx = await StampTransaction.findOne({ qrTokenNonce: payload.nonce });
    if (existingTx) {
      throw new ApiError(409, "QR_ALREADY_USED", "This QR code has already been used");
    }

    branch = await Branch.findById(payload.branchId);
    if (!branch || !branch.isActive) throw new ApiError(404, "BRANCH_NOT_FOUND", "Branch not found or inactive");

    business = await Business.findById(payload.businessId);
    if (!business || business.status !== "ACTIVE") {
      throw new ApiError(403, "BUSINESS_INACTIVE", "This business is not currently active on Thappa");
    }

    qrTokenNonce = payload.nonce;
    amountPaid = payload.amountPaid;

    tokenDoc.status = "REDEEMED";
    await tokenDoc.save();
  } else if (staticBranchId) {
    // ---- Mode B: static QR + GPS geofence + cooldown ----
    branch = await Branch.findById(staticBranchId);
    if (!branch || !branch.isActive) throw new ApiError(404, "BRANCH_NOT_FOUND", "Branch not found or inactive");

    business = await Business.findById(branch.businessId);
    if (!business || business.status !== "ACTIVE") {
      throw new ApiError(403, "BUSINESS_INACTIVE", "This business is not currently active on Thappa");
    }
    if (business.qrMode !== "STATIC_GEOFENCE") {
      throw new ApiError(400, "WRONG_MODE", "This business uses staff-generated QR codes, not static scan-in");
    }

    if (lat === undefined || lng === undefined) {
      throw new ApiError(400, "LOCATION_REQUIRED", "Location is required to confirm your visit");
    }

    const [branchLng, branchLat] = branch.location.coordinates;
    const distance = haversineDistanceMeters(lat, lng, branchLat, branchLng);
    const MAX_DISTANCE_METERS = 150;
    if (distance > MAX_DISTANCE_METERS) {
      throw new ApiError(403, "TOO_FAR", "You need to be at the branch to collect a stamp");
    }

    const cooldownHours = business.loyaltyRule.stampCooldownHours || 12;
    const cooldownStart = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);
    const existingCard = await StampCard.findOne({ customerId, branchId: branch._id });
    if (existingCard?.lastStampAt && existingCard.lastStampAt > cooldownStart) {
      throw new ApiError(429, "COOLDOWN", `You can collect one stamp every ${cooldownHours} hours here`);
    }
  } else {
    throw new ApiError(400, "MISSING_PARAMS", "Provide either qrToken (Mode A) or branchId+lat+lng (Mode B)");
  }

  // ---- Shared: find-or-create card, atomically increment, log transaction ----
  const session = await mongoose.startSession();
  let card: any;
  let redemption: any = null;

  try {
    await session.withTransaction(async () => {
      card = await StampCard.findOne({ customerId, branchId: branch!._id }).session(session);
      if (!card) {
        const created = await StampCard.create(
          [
            {
              customerId,
              businessId: business!._id,
              branchId: branch!._id,
              currentStamps: 0,
              stampsRequired: business!.loyaltyRule.stampsRequired,
            },
          ],
          { session }
        );
        card = created[0];
      }

      card.currentStamps += 1;
      card.totalStampsEarnedLifetime += 1;
      card.lastStampAt = new Date();

      await StampTransaction.create(
        [
          {
            stampCardId: card._id,
            customerId,
            businessId: business!._id,
            branchId: branch!._id,
            type: "EARN",
            qrTokenNonce,
            amountPaid,
            deviceId: req.headers["x-device-id"] as string | undefined,
            geo: lat !== undefined && lng !== undefined ? { lat, lng } : undefined,
          },
        ],
        { session }
      );

      if (card.currentStamps >= card.stampsRequired) {
        const code = generateSixDigitCode();
        const createdRedemption = await Redemption.create(
          [
            {
              stampCardId: card._id,
              customerId,
              businessId: business!._id,
              branchId: branch!._id,
              redemptionCode: code,
              status: "PENDING",
              rewardDescription: business!.loyaltyRule.rewardDescription,
            },
          ],
          { session }
        );
        redemption = createdRedemption[0];
        card.currentStamps = 0;
        card.totalRewardsRedeemedLifetime += 1;
      }

      await card.save({ session });
    });
  } finally {
    await session.endSession();
  }

  const customer = await User.findById(customerId).select("name expoPushToken");

  const io = req.app.get("io");
  io?.to(`branch:${branch!._id}`).emit("stamp:earned", {
    branchId: String(branch!._id),
    customerId: String(customerId),
    customerName: customer?.name || "A customer",
    currentStamps: card.currentStamps,
    stampsRequired: card.stampsRequired,
    rewardUnlocked: !!redemption,
  });

  if (redemption) {
    io?.to(`customer:${customerId}`).emit("reward:unlocked", { redemption });
    await sendPushNotification(customer?.expoPushToken, {
      title: "🎉 Reward unlocked!",
      body: `${business!.loyaltyRule.rewardDescription} — show your code to staff to redeem.`,
      data: { redemptionId: String(redemption._id) },
    });
  }

  res.json({
    stampCard: card,
    rewardUnlocked: !!redemption,
    redemption,
  });
});

export const getRedemptionCode = asyncHandler(async (req: Request, res: Response) => {
  const redemption = await Redemption.findOne({ _id: req.params.redemptionId, customerId: req.user!.userId });
  if (!redemption) throw new ApiError(404, "NOT_FOUND", "Redemption not found");
  res.json({ redemption });
});

export const nearbyBusinesses = asyncHandler(async (req: Request, res: Response) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    throw new ApiError(400, "MISSING_PARAMS", "lat and lng query params are required");
  }

  const branches = await Branch.find({
    isActive: true,
    location: {
      $near: {
        $geometry: { type: "Point", coordinates: [lng, lat] },
        $maxDistance: 10000, // 10km
      },
    },
  })
    .limit(20)
    .populate("businessId", "name logoUrl category status");

  const active = branches.filter((b: any) => b.businessId?.status === "ACTIVE");
  res.json({ data: active });
});
