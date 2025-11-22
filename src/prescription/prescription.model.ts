import mongoose, { Schema, Document, Model } from "mongoose";

export interface IPrescriptionItem {
  medicineName: string;
  dosage: string;
  frequency: string;
  duration: string;
  notes?: string;
}

export type ReportStatus = "PENDING" | "FORMATTED" | "FINALIZED";

export interface IPrescription extends Document {
  appointmentId: string;
  doctorId: string;
  patientId: string;
  pharmacyId?: string;
  items: IPrescriptionItem[];
  notes?: string;
  // Report workflow fields
  reportStatus: ReportStatus;
  formattedReport?: string; // HTML/PDF content of formatted report
  formattedAt?: Date;
  finalizedAt?: Date;
  finalizedBy?: string; // Admin user ID who finalized
}

const PrescriptionItemSchema = new Schema<IPrescriptionItem>(
  {
    medicineName: { type: String, required: true },
    dosage: { type: String, required: true },
    frequency: { type: String, required: true },
    duration: { type: String, required: true },
    notes: { type: String },
  },
  { _id: false }
);

const PrescriptionSchema = new Schema<IPrescription>(
  {
    appointmentId: { type: String, required: true, index: true },
    doctorId: { type: String, required: true, index: true },
    patientId: { type: String, required: true, index: true },
    pharmacyId: { type: String },
    items: { type: [PrescriptionItemSchema], default: [] },
    notes: { type: String },
    // Report workflow fields
    reportStatus: {
      type: String,
      enum: ["PENDING", "FORMATTED", "FINALIZED"],
      default: "PENDING",
      index: true,
    },
    formattedReport: { type: String },
    formattedAt: { type: Date },
    finalizedAt: { type: Date },
    finalizedBy: { type: String },
  },
  { timestamps: true }
);

// Text search index for full-text search
PrescriptionSchema.index({ "items.medicineName": "text", notes: "text" });

export const Prescription: Model<IPrescription> =
  mongoose.models.Prescription || mongoose.model<IPrescription>("Prescription", PrescriptionSchema);


