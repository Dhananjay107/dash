import { Router, Request, Response } from "express";
import { InventoryItem, IInventoryItem } from "./inventory.model";
import { requireAuth, requireRole } from "../shared/middleware/auth";

export const router = Router();

/**
 * Smart Medicine Search by Name or Composition
 * Returns all available brands for the searched medicine/composition
 * Includes batch details, expiry, pricing, margin, and location
 */
router.get("/search", requireAuth, async (req: Request, res: Response) => {
  try {
    const { pharmacyId, query, composition, brandName } = req.query;

    if (!pharmacyId) {
      return res.status(400).json({ message: "pharmacyId is required" });
    }

    const filter: any = { pharmacyId };

    // Search by medicine name, composition, or brand name
    if (query) {
      filter.$or = [
        { medicineName: { $regex: query, $options: "i" } },
        { composition: { $regex: query, $options: "i" } },
        { brandName: { $regex: query, $options: "i" } },
      ];
    }

    if (composition) {
      filter.composition = { $regex: composition, $options: "i" };
    }

    if (brandName) {
      filter.brandName = { $regex: brandName, $options: "i" };
    }

    // Find all matching inventory items
    const items = await InventoryItem.find(filter)
      .sort({ expiryDate: 1, brandName: 1 }) // Sort by expiry date (FIFO) and brand
      .limit(100);

    // Group by composition for brand selection
    const groupedByComposition = items.reduce((acc: any, item) => {
      const key = item.composition || item.medicineName;
      if (!acc[key]) {
        acc[key] = {
          composition: item.composition,
          medicineName: item.medicineName,
          brands: [],
        };
      }

      // Calculate days until expiry
      const expiryDate = new Date(item.expiryDate);
      const today = new Date();
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      // Check if expiring soon (within 30 days)
      const isExpiringSoon = daysUntilExpiry <= 30 && daysUntilExpiry >= 0;
      const isExpired = daysUntilExpiry < 0;

      acc[key].brands.push({
        inventoryItemId: String(item._id),
        brandName: item.brandName || "Generic",
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
        daysUntilExpiry,
        isExpiringSoon,
        isExpired,
        availableQuantity: item.quantity,
        costPrice: item.purchasePrice,
        sellingPrice: item.sellingPrice,
        mrp: item.mrp || item.sellingPrice,
        margin: item.margin || 0,
        rackNumber: item.rackNumber,
        rowNumber: item.rowNumber,
        // Priority: expiring soon items first, then by expiry date
        priority: isExpired ? 0 : isExpiringSoon ? 1 : 2,
      });

      return acc;
    }, {});

    // Convert to array and sort brands within each composition by priority and expiry
    const result = Object.values(groupedByComposition).map((group: any) => ({
      ...group,
      brands: group.brands.sort((a: any, b: any) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.daysUntilExpiry - b.daysUntilExpiry;
      }),
    }));

    res.json({
      query: query || composition || brandName,
      results: result,
      totalBrands: items.length,
      totalCompositions: result.length,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * Get all brands for a specific composition
 * Used for brand selection modal in pharmacy interface
 */
router.get("/brands-by-composition", requireAuth, async (req: Request, res: Response) => {
  try {
    const { pharmacyId, composition } = req.query;

    if (!pharmacyId || !composition) {
      return res.status(400).json({ message: "pharmacyId and composition are required" });
    }

    const items = await InventoryItem.find({
      pharmacyId,
      composition: { $regex: composition, $options: "i" },
      quantity: { $gt: 0 }, // Only available stock
    })
      .sort({ expiryDate: 1 }) // FIFO: earliest expiry first
      .limit(50);

    // Calculate expiry warnings
    const today = new Date();
    const brands = items.map((item) => {
      const expiryDate = new Date(item.expiryDate);
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const isExpiringSoon = daysUntilExpiry <= 30 && daysUntilExpiry >= 0;
      const isExpired = daysUntilExpiry < 0;

      return {
        inventoryItemId: String(item._id),
        brandName: item.brandName || "Generic",
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
        daysUntilExpiry,
        isExpiringSoon,
        isExpired,
        expiryWarning: isExpired
          ? "EXPIRED"
          : isExpiringSoon
          ? `Expiring in ${daysUntilExpiry} days`
          : null,
        availableQuantity: item.quantity,
        costPrice: item.purchasePrice,
        sellingPrice: item.sellingPrice,
        mrp: item.mrp || item.sellingPrice,
        margin: item.margin || 0,
        rackNumber: item.rackNumber,
        rowNumber: item.rowNumber,
        priority: isExpired ? 0 : isExpiringSoon ? 1 : 2, // For sorting
      };
    });

    // Sort by priority (expiring first) and expiry date
    brands.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.daysUntilExpiry - b.daysUntilExpiry;
    });

    res.json({
      composition,
      brands,
      totalBrands: brands.length,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * Get expiry risk items for a pharmacy
 */
router.get("/expiry-risk", requireAuth, async (req: Request, res: Response) => {
  try {
    const { pharmacyId, days = 30 } = req.query;

    if (!pharmacyId) {
      return res.status(400).json({ message: "pharmacyId is required" });
    }

    const today = new Date();
    const expiryThreshold = new Date();
    expiryThreshold.setDate(today.getDate() + Number(days));

    const items = await InventoryItem.find({
      pharmacyId,
      expiryDate: { $lte: expiryThreshold, $gte: today }, // Expiring within threshold
      quantity: { $gt: 0 },
    })
      .sort({ expiryDate: 1 })
      .limit(100);

    const riskItems = items.map((item) => {
      const expiryDate = new Date(item.expiryDate);
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      return {
        inventoryItemId: String(item._id),
        medicineName: item.medicineName,
        composition: item.composition,
        brandName: item.brandName,
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
        daysUntilExpiry,
        quantity: item.quantity,
        value: item.quantity * item.purchasePrice, // Total value at risk
        rackNumber: item.rackNumber,
        rowNumber: item.rowNumber,
      };
    });

    res.json({
      pharmacyId,
      riskItems,
      totalItems: riskItems.length,
      totalValue: riskItems.reduce((sum, item) => sum + item.value, 0),
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

