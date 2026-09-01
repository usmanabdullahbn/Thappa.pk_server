import { Schema, model, Types, Document } from "mongoose";

export interface IStampCard extends Document {
  customerId: Types.ObjectId;
  businessId: Types.ObjectId;
  branchId: Types.ObjectId;
  currentStamps: number;
  stampsRequired: number;
  totalStampsEarnedLifetime: number;
  totalRewardsRedeemedLifetime: number;
  lastStampAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const stampCardSchema = new Schema<IStampCard>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true },
    currentStamps: { type: Number, default: 0 },
    stampsRequired: { type: Number, required: true },
    totalStampsEarnedLifetime: { type: Number, default: 0 },
    totalRewardsRedeemedLifetime: { type: Number, default: 0 },
    lastStampAt: { type: Date },
  },
  { timestamps: true }
);

stampCardSchema.index({ customerId: 1, branchId: 1 }, { unique: true });
stampCardSchema.index({ businessId: 1 });

export const StampCard = model<IStampCard>("StampCard", stampCardSchema);
