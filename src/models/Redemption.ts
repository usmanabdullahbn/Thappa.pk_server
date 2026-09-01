import { Schema, model, Types, Document } from "mongoose";

export type RedemptionStatus = "PENDING" | "REDEEMED" | "EXPIRED";

export interface IRedemption extends Document {
  stampCardId: Types.ObjectId;
  customerId: Types.ObjectId;
  businessId: Types.ObjectId;
  branchId: Types.ObjectId;
  redemptionCode: string;
  status: RedemptionStatus;
  rewardDescription: string;
  createdAt: Date;
  redeemedAt?: Date;
  redeemedByStaffId?: Types.ObjectId;
}

const redemptionSchema = new Schema<IRedemption>(
  {
    stampCardId: { type: Schema.Types.ObjectId, ref: "StampCard", required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true },
    redemptionCode: { type: String, required: true },
    status: { type: String, enum: ["PENDING", "REDEEMED", "EXPIRED"], default: "PENDING" },
    rewardDescription: { type: String, required: true },
    redeemedAt: { type: Date },
    redeemedByStaffId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

redemptionSchema.index({ redemptionCode: 1 });
redemptionSchema.index({ status: 1, businessId: 1 });

export const Redemption = model<IRedemption>("Redemption", redemptionSchema);
