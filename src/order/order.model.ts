import mongoose, { Schema, Document, Model } from "mongoose";

export type OrderStatus = "PENDING" | "ORDER_RECEIVED" | "MEDICINE_RECEIVED" | "SENT_TO_PHARMACY" | "ACCEPTED" | "PACKED" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED";

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
  deliveryPersonId?: string; // ID of delivery person assigned
  deliveryPersonName?: string; // Name of delivery person
  deliveryPersonPhone?: string; // Contact number of delivery person
  estimatedDeliveryTime?: Date; // Estimated delivery time
  deliveredAt?: Date; // Actual delivery time
  deliveryNotes?: string; // Notes about delivery
  cancellationReason?: string; // Reason for cancellation
  cancelledAt?: Date; // When order was cancelled
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
      enum: ["PENDING", "ORDER_RECEIVED", "MEDICINE_RECEIVED", "SENT_TO_PHARMACY", "ACCEPTED", "PACKED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"],
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
    deliveryPersonId: { type: String },
    deliveryPersonName: { type: String },
    deliveryPersonPhone: { type: String },
    estimatedDeliveryTime: { type: Date },
    deliveredAt: { type: Date },
    deliveryNotes: { type: String },
    cancellationReason: { type: String },
    cancelledAt: { type: Date },
    adminApprovedAt: { type: Date },
    medicineReceivedAt: { type: Date },
    sentToPharmacyAt: { type: Date },
  },
  { timestamps: true }
);

export const Order: Model<IOrder> =
  mongoose.models.Order || mongoose.model<IOrder>("Order", OrderSchema);


