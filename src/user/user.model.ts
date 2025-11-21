import mongoose, { Schema, Document, Model } from "mongoose";

export type UserRole =
  | "SUPER_ADMIN"
  | "HOSPITAL_ADMIN"
  | "DOCTOR"
  | "PHARMACY_STAFF"
  | "DISTRIBUTOR"
  | "PATIENT";

export interface IUser extends Document {
  name: string;
  email: string;
  phone?: string;
  passwordHash: string;
  role: UserRole;
  hospitalId?: string;
  pharmacyId?: string;
  distributorId?: string;
  isActive: boolean;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    phone: { type: String },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["SUPER_ADMIN", "HOSPITAL_ADMIN", "DOCTOR", "PHARMACY_STAFF", "DISTRIBUTOR", "PATIENT"],
      required: true,
    },
    hospitalId: { type: String },
    pharmacyId: { type: String },
    distributorId: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Text search index for full-text search
UserSchema.index({ name: "text", email: "text" });

export const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);


