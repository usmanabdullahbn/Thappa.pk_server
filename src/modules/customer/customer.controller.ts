import { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler, ApiError } from "../../middleware/errorHandler";
import { User } from "../../models/User";
import { Business } from "../../models/Business";
import { Branch } from "../../models/Branch";
import { Campaign } from "../../models/Campaign";
import { StampCard } from "../../models/StampCard";
import { StampTransaction } from "../../models/StampTransaction";
import { Redemption } from "../../models/Redemption";
import { QrToken } from "../../models/QrToken";
import { generateSixDigitCode } from "../../utils/sixDigitCode";
import { haversineDistanceMeters } from "../../utils/haversine";
import { isCampaignLive, verifyStampQrToken } from "../qr/qr.service";
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

const CAMPAIGN_BUSINESS_FIELDS = "name category logoUrl status";
const CARD_CAMPAIGN_FIELDS = "headline stampsRequired rewardDescription expiresAt";

/** Admin-created campaigns that are switched on, not expired, and belong to an ACTIVE business, newest first. */
export const listCampaigns = asyncHandler(async (_req: Request, res: Response) => {
  const campaigns = await Campaign.find({ isActive: true, expiresAt: { $gt: new Date() } })
    .sort({ createdAt: -1 })
    .populate("businessId", CAMPAIGN_BUSINESS_FIELDS);
  res.json({ data: campaigns.filter((campaign: any) => campaign.businessId?.status === "ACTIVE") });
});

export const listJoinedCampaigns = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.userId).select("joinedCampaigns");
  if (!user) throw new ApiError(404, "NOT_FOUND", "User not found");
  res.json({ data: user.joinedCampaigns });
});

/** Idempotent: joining a campaign the customer already joined is a no-op. */
export const joinCampaign = asyncHandler(async (req: Request, res: Response) => {
  const { campaignId } = req.params;
  const campaign = mongoose.isValidObjectId(campaignId)
    ? await Campaign.findOne({ _id: campaignId, isActive: true, expiresAt: { $gt: new Date() } }).populate("businessId", "status")
    : null;
  if (!campaign || (campaign.businessId as any)?.status !== "ACTIVE") {
    throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "This campaign is no longer available");
  }
  const userId = req.user!.userId;

  await User.updateOne(
    { _id: userId, "joinedCampaigns.campaignId": { $ne: campaignId } },
    { $push: { joinedCampaigns: { campaignId, joinedAt: new Date() } } }
  );

  const user = await User.findById(userId).select("joinedCampaigns");
  if (!user) throw new ApiError(404, "NOT_FOUND", "User not found");
  res.json({ data: user.joinedCampaigns });
});

export const listStampCards = asyncHandler(async (req: Request, res: Response) => {
  const cards = await StampCard.find({ customerId: req.user!.userId })
    .sort({ updatedAt: -1 })
    .populate("businessId", "name logoUrl category")
    .populate("branchId", "name address")
    .populate("campaignId", CARD_CAMPAIGN_FIELDS);
  res.json({ data: cards });
});

export const getStampCardDetail = asyncHandler(async (req: Request, res: Response) => {
  const card = await StampCard.findOne({ _id: req.params.id, customerId: req.user!.userId })
    .populate("businessId", "name logoUrl category")
    .populate("branchId", "name address")
    .populate("campaignId", CARD_CAMPAIGN_FIELDS);
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
    const existingCard = await StampCard.findOne({ customerId, branchId: branch._id, campaignId: null });
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
      card = await StampCard.findOne({ customerId, branchId: branch!._id, campaignId: null }).session(session);
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

/**
 * Redeems a campaign stamp QR generated on the business portal (opened by the
 * phone camera or the in-app scanner). If the customer hasn't joined the
 * campaign, the token is left unused and the app is told to show the join
 * screen, so the same QR still works right after joining.
 */
export const stampCampaign = asyncHandler(async (req: Request, res: Response) => {
  const { qrToken } = req.body as { qrToken: string };
  const customerId = req.user!.userId;

  const payload = verifyStampQrToken(qrToken);
  if (!payload.campaignId) {
    throw new ApiError(400, "QR_INVALID_TYPE", "This QR code isn't linked to a campaign.");
  }

  const [campaign, business, branch, customer] = await Promise.all([
    Campaign.findOne({ _id: payload.campaignId, businessId: payload.businessId }),
    Business.findById(payload.businessId),
    Branch.findById(payload.branchId),
    User.findById(customerId).select("name expoPushToken joinedCampaigns"),
  ]);
  if (!campaign || !isCampaignLive(campaign)) {
    throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "This campaign has ended or is no longer available");
  }
  if (!business || business.status !== "ACTIVE") {
    throw new ApiError(403, "BUSINESS_INACTIVE", "This business is not currently active on Thappa");
  }
  if (!branch || !branch.isActive) throw new ApiError(404, "BRANCH_NOT_FOUND", "Branch not found or inactive");
  if (!customer) throw new ApiError(404, "NOT_FOUND", "User not found");

  const campaignSummary = {
    _id: campaign._id,
    headline: campaign.headline,
    stampsRequired: campaign.stampsRequired,
    rewardDescription: campaign.rewardDescription,
    businessName: business.name,
  };

  const hasJoined = customer.joinedCampaigns.some((item) => item.campaignId === String(campaign._id));
  if (!hasJoined) {
    res.json({ status: "NOT_JOINED", campaign: campaignSummary });
    return;
  }

  // Claim the single-use token atomically so two quick scans can't both stamp.
  const tokenDoc = await QrToken.findOneAndUpdate({ nonce: payload.nonce, status: "ISSUED" }, { status: "REDEEMED" });
  if (!tokenDoc) {
    throw new ApiError(409, "QR_ALREADY_USED", "This QR code has already been used. Ask staff for a new one.");
  }

  const session = await mongoose.startSession();
  let card: any;
  let redemption: any = null;
  let stampsCollected = 0;

  try {
    await session.withTransaction(async () => {
      card = await StampCard.findOne({ customerId, campaignId: campaign._id }).session(session);
      if (!card) {
        const created = await StampCard.create(
          [
            {
              customerId,
              businessId: business._id,
              branchId: branch._id,
              campaignId: campaign._id,
              currentStamps: 0,
              stampsRequired: campaign.stampsRequired,
            },
          ],
          { session }
        );
        card = created[0];
      }

      card.currentStamps += 1;
      card.totalStampsEarnedLifetime += 1;
      card.lastStampAt = new Date();
      stampsCollected = card.currentStamps;

      await StampTransaction.create(
        [
          {
            stampCardId: card._id,
            customerId,
            businessId: business._id,
            branchId: branch._id,
            campaignId: campaign._id,
            type: "EARN",
            qrTokenNonce: payload.nonce,
            amountPaid: payload.amountPaid,
            deviceId: req.headers["x-device-id"] as string | undefined,
          },
        ],
        { session }
      );

      if (card.currentStamps >= card.stampsRequired) {
        const createdRedemption = await Redemption.create(
          [
            {
              stampCardId: card._id,
              customerId,
              businessId: business._id,
              branchId: branch._id,
              redemptionCode: generateSixDigitCode(),
              status: "PENDING",
              rewardDescription: campaign.rewardDescription,
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
  } catch (err) {
    // Nothing was stamped, so give the customer their QR back.
    await QrToken.updateOne({ nonce: payload.nonce }, { status: "ISSUED" });
    throw err;
  } finally {
    await session.endSession();
  }

  const io = req.app.get("io");
  io?.to(`branch:${branch._id}`).emit("stamp:earned", {
    branchId: String(branch._id),
    customerId: String(customerId),
    customerName: customer.name || "A customer",
    campaignId: String(campaign._id),
    campaignHeadline: campaign.headline,
    currentStamps: stampsCollected,
    stampsRequired: campaign.stampsRequired,
    rewardUnlocked: !!redemption,
  });

  if (redemption) {
    io?.to(`customer:${customerId}`).emit("reward:unlocked", { redemption });
    await sendPushNotification(customer.expoPushToken, {
      title: "🎉 Reward unlocked!",
      body: `${campaign.rewardDescription} — show your code to staff to redeem.`,
      data: { redemptionId: String(redemption._id) },
    });
  }

  res.json({
    status: "STAMPED",
    campaign: campaignSummary,
    stampCard: card,
    stampsCollected,
    rewardUnlocked: !!redemption,
    redemption,
  });
});

export const getRedemptionCode = asyncHandler(async (req: Request, res: Response) => {
  const redemption = await Redemption.findOne({ _id: req.params.redemptionId, customerId: req.user!.userId });
  if (!redemption) throw new ApiError(404, "NOT_FOUND", "Redemption not found");
  res.json({ redemption });
});

/**
 * All reward codes for the logged-in customer, newest first. Defaults to
 * PENDING (unredeemed) only — pass ?status=all to include past redemptions.
 * This is the "show this code at the counter" list the Rewards tab renders;
 * a stamp card's `currentStamps` resets to 0 the moment a reward unlocks, so
 * that alone can never be used to detect an unlocked reward.
 */
export const listMyRedemptions = asyncHandler(async (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const filter: Record<string, unknown> = { customerId: req.user!.userId };
  if (status && status !== "all") filter.status = status;
  else if (!status) filter.status = "PENDING";

  const redemptions = await Redemption.find(filter)
    .sort({ createdAt: -1 })
    .populate("businessId", "name logoUrl category")
    .populate({ path: "stampCardId", select: "campaignId", populate: { path: "campaignId", select: "headline" } });

  res.json({ data: redemptions });
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
