import mongoose, { Schema, Document, Model } from "mongoose";

export interface IPharmacy extends Document {
  hospitalId?: string;
  name: string;
  address: string;
  phone?: string;
  isActive: boolean;
}

const PharmacySchema = new Schema<IPharmacy>(
  {
    hospitalId: { type: String, index: true },
    name: { type: String, required: true },
    address: { type: String, required: true },
    phone: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Pharmacy: Model<IPharmacy> =
  mongoose.models.Pharmacy || mongoose.model<IPharmacy>("Pharmacy", PharmacySchema);


