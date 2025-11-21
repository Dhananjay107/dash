import mongoose, { Schema, Document, Model } from "mongoose";

export type TemplateType = "PRESCRIPTION" | "BILL" | "REPORT" | "APPOINTMENT_LETTER";

export interface ITemplateVariable {
  key: string;
  label: string;
  defaultValue?: string;
  required: boolean;
}

export interface ITemplate extends Document {
  name: string;
  type: TemplateType;
  hospitalId?: string; // If null, it's a global template
  content: string; // HTML or text template with variables like {{hospitalName}}
  variables: ITemplateVariable[];
  headerImageUrl?: string;
  footerText?: string;
  isActive: boolean;
  isDefault: boolean;
}

const TemplateVariableSchema = new Schema<ITemplateVariable>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    defaultValue: { type: String },
    required: { type: Boolean, default: false },
  },
  { _id: false }
);

const TemplateSchema = new Schema<ITemplate>(
  {
    name: { type: String, required: true },
    type: {
      type: String,
      enum: ["PRESCRIPTION", "BILL", "REPORT", "APPOINTMENT_LETTER"],
      required: true,
      index: true,
    },
    hospitalId: { type: String, index: true },
    content: { type: String, required: true },
    variables: { type: [TemplateVariableSchema], default: [] },
    headerImageUrl: { type: String },
    footerText: { type: String },
    isActive: { type: Boolean, default: true, index: true },
    isDefault: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

// Ensure only one default template per type per hospital
TemplateSchema.index({ type: 1, hospitalId: 1, isDefault: 1 });

export const Template: Model<ITemplate> =
  mongoose.models.Template || mongoose.model<ITemplate>("Template", TemplateSchema);

