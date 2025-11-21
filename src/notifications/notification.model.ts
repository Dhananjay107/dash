import mongoose, { Schema, Document, Model } from "mongoose";

export type Channel = "SMS" | "WHATSAPP" | "PUSH" | "EMAIL";

export interface INotification extends Document {
  userId?: string;
  type: string;
  title: string;
  message: string;
  channel: Channel;
  status: "PENDING" | "SENT" | "FAILED" | "READ";
  metadata?: Record<string, any>;
  errorMessage?: string;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: String, index: true },
    type: { type: String, required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    channel: {
      type: String,
      enum: ["SMS", "WHATSAPP", "PUSH", "EMAIL"],
      default: "PUSH",
      index: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "SENT", "FAILED", "READ"],
      default: "PENDING",
      index: true,
    },
    metadata: { type: Schema.Types.Mixed, default: {} },
    errorMessage: { type: String },
  },
  { timestamps: true }
);

export const Notification: Model<INotification> =
  mongoose.models.Notification ||
  mongoose.model<INotification>("Notification", NotificationSchema);
