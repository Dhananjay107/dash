import mongoose, { Schema, Document, Model } from "mongoose";

export type HistoryType = 
  | "APPOINTMENT"
  | "PRESCRIPTION"
  | "REPORT_REQUEST"
  | "REPORT_RECEIVED"
  | "MEDICINE_PRESCRIBED"
  | "DIAGNOSIS"
  | "TREATMENT";

export interface IDoctorPatientHistory extends Document {
  doctorId: string;
  patientId: string;
  patientName: string;
  historyType: HistoryType;
  
  // Appointment related
  appointmentId?: string;
  appointmentDate?: Date;
  appointmentStatus?: string;
  
  // Prescription related
  prescriptionId?: string;
  prescriptionItems?: Array<{
    medicineName: string;
    dosage: string;
    frequency: string;
    duration: string;
  }>;
  prescriptionNotes?: string;
  
  // Report related
  reportRequest?: string;
  reportType?: string;
  reportFile?: string;
  
  // Diagnosis & Treatment
  diagnosis?: string;
  treatment?: string;
  doctorNotes?: string;
  
  // Metadata
  metadata?: Record<string, any>;
  
  createdAt: Date;
  updatedAt: Date;
}

const DoctorPatientHistorySchema = new Schema<IDoctorPatientHistory>(
  {
    doctorId: { type: String, required: true, index: true },
    patientId: { type: String, required: true, index: true },
    patientName: { type: String, required: true },
    historyType: {
      type: String,
      enum: ["APPOINTMENT", "PRESCRIPTION", "REPORT_REQUEST", "REPORT_RECEIVED", "MEDICINE_PRESCRIBED", "DIAGNOSIS", "TREATMENT"],
      required: true,
      index: true,
    },
    appointmentId: { type: String, index: true },
    appointmentDate: { type: Date },
    appointmentStatus: { type: String },
    prescriptionId: { type: String, index: true },
    prescriptionItems: {
      type: [{
        medicineName: { type: String, required: true },
        dosage: { type: String, required: true },
        frequency: { type: String, required: true },
        duration: { type: String, required: true },
      }],
      default: [],
    },
    prescriptionNotes: { type: String },
    reportRequest: { type: String },
    reportType: { type: String },
    reportFile: { type: String },
    diagnosis: { type: String },
    treatment: { type: String },
    doctorNotes: { type: String },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// Compound indexes for efficient queries
DoctorPatientHistorySchema.index({ doctorId: 1, patientId: 1, createdAt: -1 });
DoctorPatientHistorySchema.index({ doctorId: 1, historyType: 1, createdAt: -1 });
DoctorPatientHistorySchema.index({ doctorId: 1, createdAt: -1 });

export const DoctorPatientHistory: Model<IDoctorPatientHistory> =
  mongoose.models.DoctorPatientHistory || 
  mongoose.model<IDoctorPatientHistory>("DoctorPatientHistory", DoctorPatientHistorySchema);

