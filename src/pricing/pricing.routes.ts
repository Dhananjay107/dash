import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import { Pricing, IPricing } from "./pricing.model";
import { requireAuth, requireRole } from "../shared/middleware/auth";
import { validateRequest } from "../shared/middleware/validation";
import { body } from "express-validator";

export const router = Router();

// Helper function to get pricing ID as string
const getPricingId = (pricing: IPricing): string => String(pricing._id);

// Get all pricing rules
router.get(
  "/",
  requireAuth,
  requireRole(["SUPER_ADMIN", "HOSPITAL_ADMIN"]),
  async (req: Request, res: Response) => {
    try {
      const { serviceType, hospitalId, pharmacyId, isActive } = req.query;
      const filter: any = {};
      
      if (serviceType) filter.serviceType = serviceType;
      if (hospitalId) filter.hospitalId = hospitalId;
      if (pharmacyId) filter.pharmacyId = pharmacyId;
      if (isActive !== undefined) filter.isActive = isActive === "true";

      const pricing = await Pricing.find(filter).sort({ createdAt: -1 });
      res.json(pricing);
    } catch (error: any) {
      console.error("Error fetching pricing rules:", error);
      res.status(500).json({ message: "Failed to fetch pricing rules", error: error.message });
    }
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
  async (req: Request, res: Response) => {
    try {
      const pricing = await Pricing.create(req.body);
      res.status(201).json(pricing);
    } catch (error: any) {
      console.error("Error creating pricing rule:", error);
      res.status(500).json({ message: "Failed to create pricing rule", error: error.message });
    }
  }
);

// Update pricing rule
router.patch(
  "/:id",
  requireAuth,
  requireRole(["SUPER_ADMIN", "HOSPITAL_ADMIN"]),
  async (req: Request, res: Response) => {
    try {
      const pricing = await Pricing.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!pricing) {
        return res.status(404).json({ message: "Pricing rule not found" });
      }
      res.json(pricing);
    } catch (error: any) {
      console.error("Error updating pricing rule:", error);
      res.status(500).json({ message: "Failed to update pricing rule", error: error.message });
    }
  }
);

// Delete pricing rule
router.delete(
  "/:id",
  requireAuth,
  requireRole(["SUPER_ADMIN", "HOSPITAL_ADMIN"]),
  async (req: Request, res: Response) => {
    try {
      const pricingId = req.params.id;
      const pricing = await Pricing.findById(pricingId);
      
      if (!pricing) {
        return res.status(404).json({ message: "Pricing rule not found" });
      }

      const pricingObjectId = pricing._id as mongoose.Types.ObjectId;
      const pricingIdStr = getPricingId(pricing);

      // Try multiple deletion methods
      let deleted = false;
      let deleteResult: any = null;

      // Method 1: Standard deleteOne
      deleteResult = await Pricing.deleteOne({ _id: pricingObjectId });
      if (deleteResult.deletedCount > 0) {
        deleted = true;
      }

      // Method 2: Force delete using native collection if needed
      if (!deleted) {
        try {
          const db = mongoose.connection.db;
          if (db) {
            const collection = db.collection(Pricing.collection.name);
            const result = await collection.deleteOne(
              { _id: pricingObjectId },
              { w: 'majority', j: true } as any
            );
            if (result.deletedCount > 0) {
              deleted = true;
              deleteResult = result;
            }
          }
        } catch (collectionError: any) {
          console.error("Collection delete error:", collectionError);
        }
      }

      // Method 3: findByIdAndDelete as fallback
      if (!deleted) {
        const deletedDoc = await Pricing.findByIdAndDelete(pricingObjectId);
        if (deletedDoc) {
          deleted = true;
          deleteResult = { deletedCount: 1, acknowledged: true };
        }
      }

      // Verify deletion
      if (deleted) {
        await new Promise(resolve => setTimeout(resolve, 100));
        const verifyDelete = await Pricing.findById(pricingObjectId);
        if (verifyDelete) {
          console.error(`[DELETE] Critical: Pricing rule ${pricingIdStr} still exists after deletion`);
          return res.status(500).json({ 
            message: "Failed to delete pricing rule from database",
            error: "Document still exists after deletion attempt"
          });
        }
      } else {
        const checkExists = await Pricing.findById(pricingObjectId);
        if (!checkExists) {
          deleted = true;
        } else {
          return res.status(500).json({
            message: "Failed to delete pricing rule from database",
            error: "All deletion methods returned deletedCount: 0",
            pricingId: pricingIdStr
          });
        }
      }

      res.json({ message: "Pricing rule deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting pricing rule:", error);
      res.status(500).json({ 
        message: "Failed to delete pricing rule", 
        error: error.message 
      });
    }
  }
);
