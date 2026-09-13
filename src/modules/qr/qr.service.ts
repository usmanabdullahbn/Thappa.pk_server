import jwt from "jsonwebtoken";
import QRCode from "qrcode";
import { v4 as uuidv4 } from "uuid";
import { env } from "../../config/env";
import { Branch } from "../../models/Branch";
import { Business } from "../../models/Business";
import { Campaign, ICampaign } from "../../models/Campaign";
import { QrToken } from "../../models/QrToken";
import { ApiError } from "../../middleware/errorHandler";

export interface StampGrantPayload {
  type: "STAMP_GRANT";
  branchId: string;
  businessId: string;
  /** Present on campaign stamp QRs generated from the business portal. */
  campaignId?: string;
  issuedByStaffId: string;
  nonce: string;
  amountPaid?: number;
}

export function isCampaignLive(campaign: Pick<ICampaign, "isActive" | "expiresAt">): boolean {
  return campaign.isActive && !!campaign.expiresAt && campaign.expiresAt.getTime() > Date.now();
}

/**
 * The link a phone camera opens. `campaign` and `cafe` identify the campaign and
 * business at a glance; only the signed token `t` is trusted by the server.
 */
function buildStampLink(params: { qrToken: string; campaignId: string; businessId: string }): string {
  const query = new URLSearchParams({ campaign: params.campaignId, cafe: params.businessId, t: params.qrToken });
  return `${env.appLinkBase}?${query.toString()}`;
}

/**
 * Mode A: staff generates a short-lived, single-use, signed QR for the
 * customer currently at the counter, against one of the business's active
 * campaigns. See Technical Guide §5.2.
 */
export async function generateStampQr(params: {
  branchId: string;
  campaignId: string;
  staffUserId: string;
  amountPaid?: number;
}): Promise<{ qrToken: string; qrImageDataUrl: string; link: string; expiresAt: Date; nonce: string; campaign: ICampaign }> {
  const branch = await Branch.findById(params.branchId);
  if (!branch || !branch.isActive) {
    throw new ApiError(404, "BRANCH_NOT_FOUND", "Branch not found or inactive");
  }

  const business = await Business.findById(branch.businessId);
  if (!business || business.status !== "ACTIVE") {
    throw new ApiError(403, "BUSINESS_INACTIVE", "Business is not active");
  }

  const campaign = await Campaign.findOne({ _id: params.campaignId, businessId: business._id });
  if (!campaign || !isCampaignLive(campaign)) {
    throw new ApiError(400, "CAMPAIGN_NOT_ACTIVE", "Choose an active campaign for this business");
  }

  const ttlSeconds = business.loyaltyRule.stampTokenTtlSeconds || env.qrTokenTtlSeconds;
  const nonce = uuidv4();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  const payload: StampGrantPayload = {
    type: "STAMP_GRANT",
    branchId: String(branch._id),
    businessId: String(business._id),
    campaignId: String(campaign._id),
    issuedByStaffId: params.staffUserId,
    nonce,
    amountPaid: params.amountPaid,
  };

  const qrToken = jwt.sign(payload, env.qrSigningSecret, { expiresIn: ttlSeconds });

  // Persist the issued token so it can be revoked/looked-up before expiry
  // and so the TTL index automatically garbage-collects it afterward.
  await QrToken.create({
    nonce,
    branchId: branch._id,
    businessId: business._id,
    campaignId: campaign._id,
    issuedByStaffId: params.staffUserId,
    amountPaid: params.amountPaid,
    status: "ISSUED",
    expiresAt,
  });

  const link = buildStampLink({ qrToken, campaignId: String(campaign._id), businessId: String(business._id) });
  const qrImageDataUrl = await QRCode.toDataURL(link, { errorCorrectionLevel: "M", margin: 1, width: 480 });

  return { qrToken, qrImageDataUrl, link, expiresAt, nonce, campaign };
}

export function verifyStampQrToken(token: string): StampGrantPayload {
  let payload: StampGrantPayload;
  try {
    payload = jwt.verify(token, env.qrSigningSecret) as StampGrantPayload;
  } catch {
    throw new ApiError(400, "QR_EXPIRED", "This QR code has expired or is invalid. Ask staff to generate a new one.");
  }
  if (payload.type !== "STAMP_GRANT") {
    throw new ApiError(400, "QR_INVALID_TYPE", "This QR code is not a valid stamp QR.");
  }
  return payload;
}
