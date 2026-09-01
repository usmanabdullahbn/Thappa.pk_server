import { Schema, model, Types, Document } from "mongoose";

export type QrTokenStatus = "ISSUED" | "REDEEMED" | "EXPIRED";

export interface IQrToken extends Document {
  nonce: string;
  branchId: Types.ObjectId;
  businessId: Types.ObjectId;
  issuedByStaffId: Types.ObjectId;
  amountPaid?: number;
  status: QrTokenStatus;
  expiresAt: Date;
  createdAt: Date;
}

const qrTokenSchema = new Schema<IQrToken>(
  {
    nonce: { type: String, required: true, unique: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true },
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    issuedByStaffId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amountPaid: { type: Number },
    status: { type: String, enum: ["ISSUED", "REDEEMED", "EXPIRED"], default: "ISSUED" },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// TTL index: Mongo auto-deletes the document once expiresAt passes.
qrTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const QrToken = model<IQrToken>("QrToken", qrTokenSchema);
