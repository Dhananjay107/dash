import mongoose, { Schema, Document, Model } from "mongoose";

export type AppointmentStatus = "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";

export interface IAppointment extends Document {
  hospitalId: string;
  doctorId: string;
  patientId: string;
  scheduledAt: Date;
  status: AppointmentStatus;
  reason?: string;
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
    reason: { type: String },
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


