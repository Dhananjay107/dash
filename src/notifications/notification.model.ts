import mongoose, { Schema, Document, Model } from "mongoose";

export type Channel = "SMS" | "WHATSAPP" | "PUSH";

export interface INotification extends Document {
  to: string;
  channel: Channel;
  templateKey: string;
  payload: Record<string, any>;
  status: "PENDING" | "SENT" | "FAILED";
  errorMessage?: string;
}

const NotificationSchema = new Schema<INotification>(
  {
    to: { type: String, required: true },
    channel: { type: String, enum: ["SMS", "WHATSAPP", "PUSH"], required: true },
    templateKey: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ["PENDING", "SENT", "FAILED"],
      default: "PENDING",
      index: true,
    },
    errorMessage: { type: String },
  },
  { timestamps: true }
);

export const Notification: Model<INotification> =
  mongoose.models.Notification ||
  mongoose.model<INotification>("Notification", NotificationSchema);


