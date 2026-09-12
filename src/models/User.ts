import { Schema, model, Types, Document } from "mongoose";

export type UserRole = "ADMIN" | "BUSINESS" | "CUSTOMER";
export type AuthProvider = "GOOGLE" | "PHONE_OTP" | "PASSWORD";

export interface IJoinedCampaign {
  campaignId: string;
  joinedAt: Date;
}

export interface IUser extends Document {
  role: UserRole;
  name: string;
  email?: string;
  phone?: string;
  authProvider: AuthProvider;
  passwordHash?: string;
  businessId?: Types.ObjectId;
  branchId?: Types.ObjectId;
  profileImageUrl?: string;
  expoPushToken?: string;
  // Campaigns a CUSTOMER tapped "Join" on, before (or alongside) collecting stamps.
  joinedCampaigns: IJoinedCampaign[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    role: { type: String, enum: ["ADMIN", "BUSINESS", "CUSTOMER"], required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    authProvider: { type: String, enum: ["GOOGLE", "PHONE_OTP", "PASSWORD"], required: true },
    passwordHash: { type: String, select: false },
    businessId: { type: Schema.Types.ObjectId, ref: "Business" },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch" },
    profileImageUrl: { type: String },
    expoPushToken: { type: String },
    joinedCampaigns: {
      type: [
        new Schema<IJoinedCampaign>(
          { campaignId: { type: String, required: true }, joinedAt: { type: Date, default: Date.now } },
          { _id: false }
        ),
      ],
      default: [],
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ phone: 1 }, { unique: true, sparse: true });
userSchema.index({ role: 1, businessId: 1 });

export const User = model<IUser>("User", userSchema);
