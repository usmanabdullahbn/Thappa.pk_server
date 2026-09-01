import { Schema, model, Types, Document } from "mongoose";

export type StampTransactionType =
  | "EARN"
  | "MANUAL_ADJUST_ADD"
  | "MANUAL_ADJUST_REMOVE"
  | "REDEEM_RESET";

export interface IStampTransaction extends Document {
  stampCardId: Types.ObjectId;
  customerId: Types.ObjectId;
  businessId: Types.ObjectId;
  branchId: Types.ObjectId;
  type: StampTransactionType;
  qrTokenNonce?: string;
  amountPaid?: number;
  performedByStaffId?: Types.ObjectId;
  deviceId?: string;
  geo?: { lat: number; lng: number };
  createdAt: Date;
}

const stampTransactionSchema = new Schema<IStampTransaction>(
  {
    stampCardId: { type: Schema.Types.ObjectId, ref: "StampCard", required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true },
    type: {
      type: String,
      enum: ["EARN", "MANUAL_ADJUST_ADD", "MANUAL_ADJUST_REMOVE", "REDEEM_RESET"],
      required: true,
    },
    qrTokenNonce: { type: String },
    amountPaid: { type: Number },
    performedByStaffId: { type: Schema.Types.ObjectId, ref: "User" },
    deviceId: { type: String },
    geo: {
      lat: { type: Number },
      lng: { type: Number },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

stampTransactionSchema.index({ stampCardId: 1, createdAt: -1 });
stampTransactionSchema.index({ qrTokenNonce: 1 }, { unique: true, sparse: true });

export const StampTransaction = model<IStampTransaction>("StampTransaction", stampTransactionSchema);
