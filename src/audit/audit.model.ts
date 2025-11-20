import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAuditLog extends Document {
  userId?: string;
  method: string;
  path: string;
  body: any;
}

const AuditSchema = new Schema<IAuditLog>(
  {
    userId: { type: String, index: true },
    method: { type: String, required: true },
    path: { type: String, required: true, index: true },
    body: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export const AuditLog: Model<IAuditLog> =
  mongoose.models.AuditLog || mongoose.model<IAuditLog>("AuditLog", AuditSchema);


