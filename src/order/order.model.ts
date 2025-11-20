import mongoose, { Schema, Document, Model } from "mongoose";

export type OrderStatus = "PENDING" | "ACCEPTED" | "PACKED" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED";

export interface IOrderItem {
  prescriptionItemId?: string;
  medicineName: string;
  quantity: number;
}

export interface IOrder extends Document {
  patientId: string;
  pharmacyId: string;
  prescriptionId?: string;
  items: IOrderItem[];
  status: OrderStatus;
  deliveryType: "DELIVERY" | "PICKUP";
  address?: string;
  deliveryCharge?: number;
}

const OrderItemSchema = new Schema<IOrderItem>(
  {
    prescriptionItemId: { type: String },
    medicineName: { type: String, required: true },
    quantity: { type: Number, required: true },
  },
  { _id: false }
);

const OrderSchema = new Schema<IOrder>(
  {
    patientId: { type: String, required: true, index: true },
    pharmacyId: { type: String, required: true, index: true },
    prescriptionId: { type: String },
    items: { type: [OrderItemSchema], default: [] },
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "PACKED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"],
      default: "PENDING",
      index: true,
    },
    deliveryType: {
      type: String,
      enum: ["DELIVERY", "PICKUP"],
      default: "PICKUP",
    },
    address: { type: String },
    deliveryCharge: { type: Number },
  },
  { timestamps: true }
);

export const Order: Model<IOrder> =
  mongoose.models.Order || mongoose.model<IOrder>("Order", OrderSchema);


