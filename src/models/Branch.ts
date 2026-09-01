import { Schema, model, Types, Document } from "mongoose";

export interface IBranch extends Document {
  businessId: Types.ObjectId;
  name: string;
  address?: string;
  location: {
    type: "Point";
    coordinates: [number, number]; // [lng, lat]
  };
  staffUserIds: Types.ObjectId[];
  qrStaticCode?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const branchSchema = new Schema<IBranch>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    name: { type: String, required: true, trim: true },
    address: { type: String },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], default: [0, 0] },
    },
    staffUserIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    qrStaticCode: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

branchSchema.index({ businessId: 1 });
branchSchema.index({ location: "2dsphere" });

export const Branch = model<IBranch>("Branch", branchSchema);
