import mongoose, { Schema, Document, Model } from "mongoose";

export interface IHospital extends Document {
  name: string;
  address: string;
  phone?: string;
  isActive: boolean;
}

const HospitalSchema = new Schema<IHospital>(
  {
    name: { type: String, required: true },
    address: { type: String, required: true },
    phone: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Hospital: Model<IHospital> =
  mongoose.models.Hospital || mongoose.model<IHospital>("Hospital", HospitalSchema);


