import { Schema, model, Types, Document } from "mongoose";

/** A loyalty campaign created by a Thappa admin and shown to customers in the mobile app. */
export interface ICampaign extends Document {
  businessId: Types.ObjectId;
  headline: string;
  description: string;
  stampsRequired: number;
  rewardDescription: string;
  isActive: boolean;
  createdByAdminId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const campaignSchema = new Schema<ICampaign>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    headline: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    stampsRequired: { type: Number, required: true, min: 1 },
    rewardDescription: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    createdByAdminId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

campaignSchema.index({ isActive: 1, createdAt: -1 });
campaignSchema.index({ businessId: 1 });

export const Campaign = model<ICampaign>("Campaign", campaignSchema);
