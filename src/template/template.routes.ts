import { Router } from "express";
import { Template } from "./template.model";
import { requireAuth, requireRole } from "../shared/middleware/auth";
import { validateRequest } from "../shared/middleware/validation";
import { body } from "express-validator";
import { AppError } from "../shared/middleware/errorHandler";

export const router = Router();

// Get all templates
router.get(
  "/",
  requireAuth,
  requireRole(["SUPER_ADMIN", "HOSPITAL_ADMIN", "DOCTOR", "PHARMACY_STAFF"]),
  async (req, res) => {
    const { type, hospitalId } = req.query;
    const filter: any = { isActive: true };
    if (type) filter.type = type;
    if (hospitalId) {
      filter.$or = [{ hospitalId }, { hospitalId: null }]; // Global or hospital-specific
    } else {
      filter.hospitalId = null; // Only global templates
    }

    const templates = await Template.find(filter).sort({ isDefault: -1, createdAt: -1 });
    res.json(templates);
  }
);

// Get default template for a type
router.get(
  "/default/:type",
  requireAuth,
  async (req, res) => {
    const { hospitalId } = req.query;
    const filter: any = {
      type: req.params.type,
      isActive: true,
      isDefault: true,
    };

    // Try hospital-specific first, then global
    if (hospitalId) {
      const hospitalTemplate = await Template.findOne({ ...filter, hospitalId });
      if (hospitalTemplate) {
        return res.json(hospitalTemplate);
      }
    }

    const globalTemplate = await Template.findOne({ ...filter, hospitalId: null });
    if (!globalTemplate) {
      return res.status(404).json({ message: "No default template found" });
    }

    res.json(globalTemplate);
  }
);

// Create template
router.post(
  "/",
  requireAuth,
  requireRole(["SUPER_ADMIN", "HOSPITAL_ADMIN"]),
  [
    body("name").notEmpty().withMessage("Template name is required"),
    body("type").isIn(["PRESCRIPTION", "BILL", "REPORT", "APPOINTMENT_LETTER"]).withMessage("Invalid template type"),
    body("content").notEmpty().withMessage("Template content is required"),
  ],
  validateRequest,
  async (req, res) => {
    const { name, type, hospitalId, content, variables, headerImageUrl, footerText, isDefault } = req.body;

    // If setting as default, unset other defaults for same type and hospital
    if (isDefault) {
      await Template.updateMany(
        { type, hospitalId: hospitalId || null, isDefault: true },
        { isDefault: false }
      );
    }

    const template = await Template.create({
      name,
      type,
      hospitalId: hospitalId || null,
      content,
      variables: variables || [],
      headerImageUrl,
      footerText,
      isDefault: isDefault || false,
      isActive: true,
    });

    res.status(201).json(template);
  }
);

// Update template
router.patch(
  "/:id",
  requireAuth,
  requireRole(["SUPER_ADMIN", "HOSPITAL_ADMIN"]),
  async (req, res) => {
    const { name, content, variables, headerImageUrl, footerText, isActive, isDefault } = req.body;
    const template = await Template.findById(req.params.id);

    if (!template) {
      throw new AppError("Template not found", 404);
    }

    // If setting as default, unset other defaults
    if (isDefault && !template.isDefault) {
      await Template.updateMany(
        { type: template.type, hospitalId: template.hospitalId, isDefault: true },
        { isDefault: false }
      );
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (content !== undefined) updateData.content = content;
    if (variables !== undefined) updateData.variables = variables;
    if (headerImageUrl !== undefined) updateData.headerImageUrl = headerImageUrl;
    if (footerText !== undefined) updateData.footerText = footerText;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (isDefault !== undefined) updateData.isDefault = isDefault;

    const updated = await Template.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json(updated);
  }
);

// Delete template
router.delete(
  "/:id",
  requireAuth,
  requireRole(["SUPER_ADMIN", "HOSPITAL_ADMIN"]),
  async (req, res) => {
    try {
      const templateId = req.params.id;
      const template = await Template.findById(templateId);
      if (!template) {
        throw new AppError("Template not found", 404);
      }

      // Delete the template and verify deletion
      const deleteResult = await Template.deleteOne({ _id: templateId });
      
      if (deleteResult.deletedCount === 0) {
        throw new AppError("Failed to delete template", 500);
      }

      // Verify deletion
      const verifyDelete = await Template.findById(templateId);
      if (verifyDelete) {
        // Try force delete using collection
        await Template.collection.deleteOne({ _id: template._id });
        const verifyAgain = await Template.findById(templateId);
        if (verifyAgain) {
          throw new AppError("Failed to delete template from database", 500);
        }
      }

      res.json({ message: "Template deleted" });
    } catch (error: any) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(error.message || "Failed to delete template", 500);
    }
  }
);

// Render template with data
router.post(
  "/:id/render",
  requireAuth,
  async (req, res) => {
    const template = await Template.findById(req.params.id);
    if (!template) {
      throw new AppError("Template not found", 404);
    }

    const { data } = req.body; // Object with variable values
    let rendered = template.content;

    // Replace template variables {{variableName}} with actual values
    template.variables.forEach((variable) => {
      const value = data[variable.key] || variable.defaultValue || "";
      const regex = new RegExp(`\\{\\{${variable.key}\\}\\}`, "g");
      rendered = rendered.replace(regex, value);
    });

    // Also replace common variables if not in variables array
    const commonVars: Record<string, string> = {
      hospitalName: data.hospitalName || "",
      doctorName: data.doctorName || "",
      patientName: data.patientName || "",
      date: data.date || new Date().toLocaleDateString(),
      time: data.time || new Date().toLocaleTimeString(),
      ...data,
    };

    Object.keys(commonVars).forEach((key) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
      rendered = rendered.replace(regex, commonVars[key]);
    });

    res.json({ rendered, template });
  }
);

