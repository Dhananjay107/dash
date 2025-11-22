import mongoose, { Document, Model, Schema } from "mongoose";

export interface IReportRequest extends Document {
  doctorId: string;
  patientId: string;
  requestedAt: Date;
  reportType: string;
  description?: string;
  status: "PENDING" | "UPLOADED" | "REVIEWED";
  uploadedAt?: Date;
  fileUrl?: string;
  fileName?: string;
}

const ReportRequestSchema = new Schema<IReportRequest>(
  {
    doctorId: {
      type: String,
      required: true,
      ref: "User",
    },
    patientId: {
      type: String,
      required: true,
      ref: "User",
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    reportType: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    status: {
      type: String,
      enum: ["PENDING", "UPLOADED", "REVIEWED"],
      default: "PENDING",
    },
    uploadedAt: {
      type: Date,
    },
    fileUrl: {
      type: String,
    },
    fileName: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

export const ReportRequest: Model<IReportRequest> =
  mongoose.models.ReportRequest ||
  mongoose.model<IReportRequest>("ReportRequest", ReportRequestSchema);

