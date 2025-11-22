import mongoose, { Schema, Document, Model } from "mongoose";

export type AppointmentStatus = "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";

export interface IAppointment extends Document {
  hospitalId: string;
  doctorId: string;
  patientId: string;
  scheduledAt: Date;
  status: AppointmentStatus;
  // Patient booking details
  patientName: string;
  age: number;
  address: string;
  issue: string; // Main issue/description
  reportFile?: string; // File path/URL if report uploaded
  reportFileName?: string; // Original file name
  // Legacy fields (keeping for backward compatibility)
  reason?: string; // Deprecated - use issue instead
  channel: "PHYSICAL" | "VIDEO";
}

const AppointmentSchema = new Schema<IAppointment>(
  {
    hospitalId: { type: String, required: true, index: true },
    doctorId: { type: String, required: true, index: true },
    patientId: { type: String, required: true, index: true },
    scheduledAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED"],
      default: "PENDING",
      index: true,
    },
    // Patient booking details
    patientName: { type: String, required: true },
    age: { type: Number, required: true },
    address: { type: String, required: true },
    issue: { type: String, required: true },
    reportFile: { type: String }, // File path/URL
    reportFileName: { type: String }, // Original file name
    // Legacy fields (keeping for backward compatibility)
    reason: { type: String }, // Deprecated - use issue instead
    channel: {
      type: String,
      enum: ["PHYSICAL", "VIDEO"],
      default: "PHYSICAL",
    },
  },
  { timestamps: true }
);

export const Appointment: Model<IAppointment> =
  mongoose.models.Appointment || mongoose.model<IAppointment>("Appointment", AppointmentSchema);


