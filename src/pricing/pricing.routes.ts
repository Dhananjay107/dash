import { Router } from "express";
import { Pricing } from "./pricing.model";
import { requireAuth, requireRole } from "../shared/middleware/auth";
import { validateRequest } from "../shared/middleware/validation";
import { body } from "express-validator";

export const router = Router();

// Get all pricing rules
router.get(
  "/",
  requireAuth,
  requireRole(["SUPER_ADMIN", "HOSPITAL_ADMIN"]),
  async (req, res) => {
    const { serviceType, hospitalId, pharmacyId, isActive } = req.query;
    const filter: any = {};
    if (serviceType) filter.serviceType = serviceType;
    if (hospitalId) filter.hospitalId = hospitalId;
    if (pharmacyId) filter.pharmacyId = pharmacyId;
    if (isActive !== undefined) filter.isActive = isActive === "true";

    const pricing = await Pricing.find(filter).sort({ createdAt: -1 });
    res.json(pricing);
  }
);

// Create pricing rule
router.post(
  "/",
  requireAuth,
  requireRole(["SUPER_ADMIN", "HOSPITAL_ADMIN"]),
  [
    body("serviceType").isIn(["CONSULTATION", "DELIVERY", "SUBSCRIPTION", "DISCOUNT"]).withMessage("Invalid service type"),
    body("basePrice").isNumeric().withMessage("Base price must be a number"),
  ],
  validateRequest,
  async (req, res) => {
    const pricing = await Pricing.create(req.body);
    res.status(201).json(pricing);
  }
);

// Update pricing rule
router.patch(
  "/:id",
  requireAuth,
  requireRole(["SUPER_ADMIN", "HOSPITAL_ADMIN"]),
  async (req, res) => {
    const pricing = await Pricing.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!pricing) {
      return res.status(404).json({ message: "Pricing rule not found" });
    }
    res.json(pricing);
  }
);

// Delete pricing rule
router.delete(
  "/:id",
  requireAuth,
  requireRole(["SUPER_ADMIN", "HOSPITAL_ADMIN"]),
  async (req, res) => {
    try {
      const pricingId = req.params.id;
      const pricing = await Pricing.findById(pricingId);
      if (!pricing) {
        return res.status(404).json({ message: "Pricing rule not found" });
      }

      // Delete the pricing rule and verify deletion
      const deleteResult = await Pricing.deleteOne({ _id: pricingId });
      
      if (deleteResult.deletedCount === 0) {
        return res.status(500).json({ message: "Failed to delete pricing rule" });
      }

      // Verify deletion
      const verifyDelete = await Pricing.findById(pricingId);
      if (verifyDelete) {
        // Try force delete using collection
        await Pricing.collection.deleteOne({ _id: pricing._id });
        const verifyAgain = await Pricing.findById(pricingId);
        if (verifyAgain) {
          return res.status(500).json({ message: "Failed to delete pricing rule from database" });
        }
      }

      res.json({ message: "Pricing rule deleted" });
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to delete pricing rule" });
    }
  }
);

