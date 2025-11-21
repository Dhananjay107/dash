import mongoose, { Schema, Document, Model } from "mongoose";

export interface IPricing extends Document {
  serviceType: "CONSULTATION" | "DELIVERY" | "SUBSCRIPTION" | "DISCOUNT";
  hospitalId?: string;
  pharmacyId?: string;
  basePrice: number;
  discountPercent?: number;
  discountAmount?: number;
  isActive: boolean;
  validFrom?: Date;
  validTo?: Date;
  metadata?: Record<string, any>;
}

const PricingSchema = new Schema<IPricing>(
  {
    serviceType: {
      type: String,
      enum: ["CONSULTATION", "DELIVERY", "SUBSCRIPTION", "DISCOUNT"],
      required: true,
      index: true,
    },
    hospitalId: { type: String, index: true },
    pharmacyId: { type: String, index: true },
    basePrice: { type: Number, required: true },
    discountPercent: { type: Number, min: 0, max: 100 },
    discountAmount: { type: Number, min: 0 },
    isActive: { type: Boolean, default: true, index: true },
    validFrom: { type: Date },
    validTo: { type: Date },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export const Pricing: Model<IPricing> =
  mongoose.models.Pricing || mongoose.model<IPricing>("Pricing", PricingSchema);

