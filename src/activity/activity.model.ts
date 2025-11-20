import mongoose, { Document, Model, Schema } from "mongoose";

export type ActivityType =
  | "APPOINTMENT_CREATED"
  | "APPOINTMENT_CONFIRMED"
  | "APPOINTMENT_CANCELLED"
  | "APPOINTMENT_RESCHEDULED"
  | "PRESCRIPTION_CREATED"
  | "ORDER_CREATED"
  | "ORDER_STATUS_UPDATED"
  | "INVENTORY_LOW_STOCK"
  | "DISTRIBUTOR_ORDER_CREATED"
  | "DISTRIBUTOR_ORDER_DELIVERED"
  | "FINANCE_ENTRY_CREATED"
  | "USER_CREATED";

export interface IActivity extends Document {
  type: ActivityType;
  title: string;
  description: string;
  userId?: string;
  hospitalId?: string;
  pharmacyId?: string;
  distributorId?: string;
  doctorId?: string;
  patientId?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

const ActivitySchema = new Schema<IActivity>(
  {
    type: {
      type: String,
      enum: [
        "APPOINTMENT_CREATED",
        "APPOINTMENT_CONFIRMED",
        "APPOINTMENT_CANCELLED",
        "APPOINTMENT_RESCHEDULED",
        "PRESCRIPTION_CREATED",
        "ORDER_CREATED",
        "ORDER_STATUS_UPDATED",
        "INVENTORY_LOW_STOCK",
        "DISTRIBUTOR_ORDER_CREATED",
        "DISTRIBUTOR_ORDER_DELIVERED",
        "FINANCE_ENTRY_CREATED",
        "USER_CREATED",
      ],
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    description: { type: String, required: true },
    userId: { type: String, index: true },
    hospitalId: { type: String, index: true },
    pharmacyId: { type: String, index: true },
    distributorId: { type: String, index: true },
    doctorId: { type: String, index: true },
    patientId: { type: String, index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const Activity: Model<IActivity> =
  mongoose.models.Activity || mongoose.model<IActivity>("Activity", ActivitySchema);

