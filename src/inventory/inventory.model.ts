import mongoose, { Schema, Document, Model } from "mongoose";

export interface IInventoryItem extends Document {
  pharmacyId: string;
  medicineName: string;
  batchNumber: string;
  expiryDate: Date;
  quantity: number;
  threshold: number;
  distributorId?: string;
}

const InventorySchema = new Schema<IInventoryItem>(
  {
    pharmacyId: { type: String, required: true, index: true },
    medicineName: { type: String, required: true, index: true },
    batchNumber: { type: String, required: true },
    expiryDate: { type: Date, required: true },
    quantity: { type: Number, required: true },
    threshold: { type: Number, required: true, default: 10 },
    distributorId: { type: String },
  },
  { timestamps: true }
);

InventorySchema.index({ pharmacyId: 1, medicineName: 1 });
InventorySchema.index({ medicineName: "text", batchNumber: "text" });

export const InventoryItem: Model<IInventoryItem> =
  mongoose.models.InventoryItem || mongoose.model<IInventoryItem>("InventoryItem", InventorySchema);
