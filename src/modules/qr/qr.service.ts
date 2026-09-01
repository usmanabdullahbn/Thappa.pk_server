import jwt from "jsonwebtoken";
import QRCode from "qrcode";
import { v4 as uuidv4 } from "uuid";
import { env } from "../../config/env";
import { Branch } from "../../models/Branch";
import { Business } from "../../models/Business";
import { QrToken } from "../../models/QrToken";
import { ApiError } from "../../middleware/errorHandler";

export interface StampGrantPayload {
  type: "STAMP_GRANT";
  branchId: string;
  businessId: string;
  issuedByStaffId: string;
  nonce: string;
  amountPaid?: number;
}

/**
 * Mode A: staff generates a short-lived, single-use, signed QR for the
 * customer currently at the counter. See Technical Guide §5.2.
 */
export async function generateStampQr(params: {
  branchId: string;
  staffUserId: string;
  amountPaid?: number;
}): Promise<{ qrToken: string; qrImageDataUrl: string; expiresAt: Date; nonce: string }> {
  const branch = await Branch.findById(params.branchId);
  if (!branch || !branch.isActive) {
    throw new ApiError(404, "BRANCH_NOT_FOUND", "Branch not found or inactive");
  }

  const business = await Business.findById(branch.businessId);
  if (!business || business.status !== "ACTIVE") {
    throw new ApiError(403, "BUSINESS_INACTIVE", "Business is not active");
  }

  const ttlSeconds = business.loyaltyRule.stampTokenTtlSeconds || env.qrTokenTtlSeconds;
  const nonce = uuidv4();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  const payload: StampGrantPayload = {
    type: "STAMP_GRANT",
    branchId: String(branch._id),
    businessId: String(business._id),
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
    issuedByStaffId: params.staffUserId,
    amountPaid: params.amountPaid,
    status: "ISSUED",
    expiresAt,
  });

  const qrImageDataUrl = await QRCode.toDataURL(qrToken, { errorCorrectionLevel: "M", margin: 1, width: 400 });

  return { qrToken, qrImageDataUrl, expiresAt, nonce };
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
