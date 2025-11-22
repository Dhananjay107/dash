import mongoose, { Schema, Document, Model } from "mongoose";

export type ConversationType = "ONLINE" | "OFFLINE";
export type MessageType = "TEXT" | "AUDIO" | "IMAGE" | "FILE";
export type SenderRole = "DOCTOR" | "PATIENT";

export interface IMessage {
  senderId: string;
  senderRole: SenderRole;
  messageType: MessageType;
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface IConversation extends Document {
  appointmentId: string;
  doctorId: string;
  patientId: string;
  hospitalId: string;
  conversationType: ConversationType;
  messages: IMessage[];
  summary?: string;
  prescriptionId?: string;
  isActive: boolean;
  startedAt: Date;
  endedAt?: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    senderId: { type: String, required: true },
    senderRole: { type: String, enum: ["DOCTOR", "PATIENT"], required: true },
    messageType: {
      type: String,
      enum: ["TEXT", "AUDIO", "IMAGE", "FILE"],
      default: "TEXT",
    },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    metadata: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const ConversationSchema = new Schema<IConversation>(
  {
    appointmentId: { type: String, required: true, index: true },
    doctorId: { type: String, required: true, index: true },
    patientId: { type: String, required: true, index: true },
    hospitalId: { type: String, required: true, index: true },
    conversationType: {
      type: String,
      enum: ["ONLINE", "OFFLINE"],
      required: true,
    },
    messages: { type: [MessageSchema], default: [] },
    summary: { type: String },
    prescriptionId: { type: String, index: true },
    isActive: { type: Boolean, default: true, index: true },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date },
  },
  { timestamps: true }
);

export const Conversation: Model<IConversation> =
  mongoose.models.Conversation ||
  mongoose.model<IConversation>("Conversation", ConversationSchema);
