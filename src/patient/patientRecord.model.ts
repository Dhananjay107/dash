import mongoose, { Document, Model, Schema } from "mongoose";

export interface IPatientRecord extends Document {
  patientId: string;
  doctorId?: string;
  hospitalId?: string;

  // Medical History
  diagnosis?: string[];
  allergies?: string[];
  currentMedications?: string[];
  pastSurgeries?: string[];
  hospitalizationHistory?: Array<{
    date: Date;
    reason: string;
    duration?: string;
  }>;

  // Lab Reports & Documents
  labReports?: Array<{
    date: Date;
    testName: string;
    results: string;
    fileUrl?: string;
  }>;

  // Notes
  notes?: string;
  updatedBy?: string; // Doctor ID who last updated
}

const PatientRecordSchema = new Schema<IPatientRecord>(
  {
    patientId: { type: String, required: true, index: true },
    doctorId: { type: String, index: true },
    hospitalId: { type: String, index: true },
    diagnosis: { type: [String], default: [] },
    allergies: { type: [String], default: [] },
    currentMedications: { type: [String], default: [] },
    pastSurgeries: { type: [String], default: [] },
    hospitalizationHistory: {
      type: [
        {
          date: { type: Date, required: true },
          reason: { type: String, required: true },
          duration: { type: String },
        },
      ],
      default: [],
    },
    labReports: {
      type: [
        {
          date: { type: Date, required: true },
          testName: { type: String, required: true },
          results: { type: String, required: true },
          fileUrl: { type: String },
        },
      ],
      default: [],
    },
    notes: { type: String },
    updatedBy: { type: String },
  },
  { timestamps: true }
);

// Ensure one record per patient (upsert pattern)
PatientRecordSchema.index({ patientId: 1 }, { unique: true });

export const PatientRecord: Model<IPatientRecord> =
  mongoose.models.PatientRecord ||
  mongoose.model<IPatientRecord>("PatientRecord", PatientRecordSchema);

