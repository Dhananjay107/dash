import mongoose, { Schema, Document, Model } from "mongoose";

export interface IStockAuditItem {
  inventoryItemId: string;
  medicineName: string;
  composition: string;
  brandName?: string;
  batchNumber: string;
  openingStock: number; // Stock at start of day
  systemSales: number; // Quantity sold through system
  manualBills: number; // Quantity sold through manual bills
  totalSales: number; // systemSales + manualBills
  expectedClosingStock: number; // openingStock - totalSales
  actualClosingStock?: number; // Physical count at end of day
  variance?: number; // actualClosingStock - expectedClosingStock
  varianceReason?: string; // Reason for variance if any
}

export interface IStockAudit extends Document {
  pharmacyId: string;
  auditDate: Date; // Date for which audit is done
  auditType: "DAILY" | "WEEKLY" | "MONTHLY" | "AD_HOC";
  items: IStockAuditItem[];
  totalItems: number;
  itemsWithVariance: number; // Count of items with variance
  totalVarianceValue?: number; // Total financial value of variance
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "REVIEWED" | "DISPUTED";
  openingStockValue?: number; // Total value of opening stock
  totalSalesValue?: number; // Total value of sales
  closingStockValue?: number; // Total value of closing stock
  reviewedBy?: string; // User ID who reviewed
  reviewedAt?: Date;
  reviewedNotes?: string;
  createdBy: string; // User ID who created the audit
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const StockAuditItemSchema = new Schema<IStockAuditItem>(
  {
    inventoryItemId: { type: String, required: true },
    medicineName: { type: String, required: true },
    composition: { type: String, required: true },
    brandName: { type: String },
    batchNumber: { type: String, required: true },
    openingStock: { type: Number, required: true },
    systemSales: { type: Number, default: 0 },
    manualBills: { type: Number, default: 0 },
    totalSales: { type: Number, required: true },
    expectedClosingStock: { type: Number, required: true },
    actualClosingStock: { type: Number },
    variance: { type: Number },
    varianceReason: { type: String },
  },
  { _id: false }
);

const StockAuditSchema = new Schema<IStockAudit>(
  {
    pharmacyId: { type: String, required: true, index: true },
    auditDate: { type: Date, required: true, index: true },
    auditType: {
      type: String,
      enum: ["DAILY", "WEEKLY", "MONTHLY", "AD_HOC"],
      default: "DAILY",
      index: true,
    },
    items: { type: [StockAuditItemSchema], required: true },
    totalItems: { type: Number, required: true },
    itemsWithVariance: { type: Number, default: 0 },
    totalVarianceValue: { type: Number },
    status: {
      type: String,
      enum: ["PENDING", "IN_PROGRESS", "COMPLETED", "REVIEWED", "DISPUTED"],
      default: "PENDING",
      index: true,
    },
    openingStockValue: { type: Number },
    totalSalesValue: { type: Number },
    closingStockValue: { type: Number },
    reviewedBy: { type: String },
    reviewedAt: { type: Date },
    reviewedNotes: { type: String },
    createdBy: { type: String, required: true, index: true },
    notes: { type: String },
  },
  { timestamps: true }
);

// Compound indexes
StockAuditSchema.index({ pharmacyId: 1, auditDate: -1 });
StockAuditSchema.index({ pharmacyId: 1, status: 1 });
StockAuditSchema.index({ auditDate: 1, status: 1 });

// Pre-save hook to calculate variance
StockAuditSchema.pre("save", function (next) {
  if (this.isModified("items")) {
    // Calculate total sales for each item
    this.items.forEach((item) => {
      item.totalSales = item.systemSales + item.manualBills;
      item.expectedClosingStock = item.openingStock - item.totalSales;
      if (item.actualClosingStock !== undefined) {
        item.variance = item.actualClosingStock - item.expectedClosingStock;
      }
    });

    // Calculate summary fields
    this.totalItems = this.items.length;
    this.itemsWithVariance = this.items.filter(
      (item) => item.variance !== undefined && item.variance !== 0
    ).length;
  }
  next();
});

export const StockAudit: Model<IStockAudit> =
  mongoose.models.StockAudit || mongoose.model<IStockAudit>("StockAudit", StockAuditSchema);

// Request Audit Log Model (for tracking API requests)
export interface IAuditLog extends Document {
  userId?: string;
  method: string;
  path: string;
  body?: Record<string, any>;
  ip?: string;
  userAgent?: string;
  createdAt?: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
    {
    userId: { type: String, index: true },
    method: { type: String, required: true, index: true },
    path: { type: String, required: true, index: true },
      body: { type: Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
    },
    { timestamps: true }
  );

// Compound index for querying by user and path
AuditLogSchema.index({ userId: 1, createdAt: -1 });
AuditLogSchema.index({ path: 1, createdAt: -1 });

export const AuditLog: Model<IAuditLog> =
  mongoose.models.AuditLog || mongoose.model<IAuditLog>("AuditLog", AuditLogSchema);
