import { Schema, model, Types, Document } from "mongoose";

export type BusinessCategory = "CAFE" | "RESTAURANT" | "SALON" | "GYM" | "OTHER";
export type BusinessStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "CANCELLED";
export type QrMode = "DYNAMIC_STAFF" | "STATIC_GEOFENCE";

export interface ILoyaltyRule {
  stampsRequired: number;
  rewardDescription: string;
  stampCooldownHours: number; // used in STATIC_GEOFENCE mode
  stampTokenTtlSeconds: number; // used in DYNAMIC_STAFF mode
}

export interface IBusiness extends Document {
  name: string;
  category: BusinessCategory;
  ownerUserId: Types.ObjectId;
  logoUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  status: BusinessStatus;
  onboardedByAdminId?: Types.ObjectId;
  qrMode: QrMode;
  loyaltyRule: ILoyaltyRule;
  createdAt: Date;
  updatedAt: Date;
}

const loyaltyRuleSchema = new Schema<ILoyaltyRule>(
  {
    stampsRequired: { type: Number, default: 5, min: 1 },
    rewardDescription: { type: String, default: "1 Free Item" },
    stampCooldownHours: { type: Number, default: 12 },
    stampTokenTtlSeconds: { type: Number, default: 300 },
  },
  { _id: false }
);

const businessSchema = new Schema<IBusiness>(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, enum: ["CAFE", "RESTAURANT", "SALON", "GYM", "OTHER"], default: "CAFE" },
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    logoUrl: { type: String },
    contactEmail: { type: String },
    contactPhone: { type: String },
    status: { type: String, enum: ["PENDING", "ACTIVE", "SUSPENDED", "CANCELLED"], default: "ACTIVE" },
    onboardedByAdminId: { type: Schema.Types.ObjectId, ref: "User" },
    qrMode: { type: String, enum: ["DYNAMIC_STAFF", "STATIC_GEOFENCE"], default: "DYNAMIC_STAFF" },
    loyaltyRule: { type: loyaltyRuleSchema, default: () => ({}) },
  },
  { timestamps: true }
);

businessSchema.index({ ownerUserId: 1 });
businessSchema.index({ status: 1 });

export const Business = model<IBusiness>("Business", businessSchema);
