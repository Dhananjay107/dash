import { Router, Request, Response } from "express";
import { StockAudit, IStockAudit } from "./audit.model";
import { InventoryItem } from "../inventory/inventory.model";
import { PharmacyInvoice } from "../invoice/pharmacyInvoice.model";
import { requireAuth, requireRole } from "../shared/middleware/auth";
import { createActivity } from "../activity/activity.service";

export const router = Router();

// Create or initialize daily audit
router.post("/daily", requireAuth, requireRole(["SUPER_ADMIN", "PHARMACY_STAFF"]), async (req: Request, res: Response) => {
  try {
    const { pharmacyId, auditDate } = req.body;
    const userId = (req as any).user?.userId;

    const auditDateObj = auditDate ? new Date(auditDate) : new Date();
    auditDateObj.setHours(0, 0, 0, 0);

    // Check if audit already exists
    const existingAudit = await StockAudit.findOne({
      pharmacyId,
      auditDate: auditDateObj,
      auditType: "DAILY",
    });

    if (existingAudit) {
      return res.status(400).json({ message: "Daily audit already exists for this date" });
    }

    // Get all inventory items for the pharmacy
    const inventoryItems = await InventoryItem.find({ pharmacyId });

    // Get system sales for the day (from invoices)
    const startOfDay = new Date(auditDateObj);
    const endOfDay = new Date(auditDateObj);
    endOfDay.setHours(23, 59, 59, 999);

    const invoices = await PharmacyInvoice.find({
      pharmacyId,
      billDate: { $gte: startOfDay, $lte: endOfDay },
    });

    // Create audit items
    const auditItems = inventoryItems.map((item) => {
      // Calculate system sales from invoices
      let systemSales = 0;
      invoices.forEach((invoice) => {
        invoice.items.forEach((invoiceItem) => {
          if (String(invoiceItem.inventoryItemId) === String(item._id)) {
            systemSales += invoiceItem.quantity;
          }
        });
      });

      return {
        inventoryItemId: String(item._id),
        medicineName: item.medicineName,
        composition: item.composition,
        brandName: item.brandName,
        batchNumber: item.batchNumber,
        openingStock: item.quantity + systemSales, // Current stock + sales = opening stock
        systemSales,
        manualBills: 0, // To be filled by user
        totalSales: systemSales,
        expectedClosingStock: item.quantity, // Current stock is expected closing
        actualClosingStock: undefined,
        variance: undefined,
      };
    });

    const audit = await StockAudit.create({
      pharmacyId,
      auditDate: auditDateObj,
      auditType: "DAILY",
      items: auditItems,
      totalItems: auditItems.length,
      status: "IN_PROGRESS",
      createdBy: userId,
    } as IStockAudit);

    await createActivity(
      "AUDIT_CREATED",
      "Daily Audit Created",
      `Daily audit created for ${pharmacyId} on ${auditDateObj.toLocaleDateString()}`,
      {
        pharmacyId,
        metadata: {
          auditId: String(audit._id),
          auditDate: auditDateObj.toISOString(),
        },
      }
    );

    res.status(201).json(audit);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

// Update audit with actual closing stock
router.patch("/:id/closing-stock", requireAuth, requireRole(["SUPER_ADMIN", "PHARMACY_STAFF"]), async (req: Request, res: Response) => {
  try {
    const { items } = req.body; // Array of { inventoryItemId, actualClosingStock, varianceReason? }

    const audit = await StockAudit.findById(req.params.id);
    if (!audit) {
      return res.status(404).json({ message: "Audit not found" });
    }

    // Update items with actual closing stock
    const itemsMap = new Map(items.map((item: any) => [item.inventoryItemId, item]));

    audit.items = audit.items.map((item) => {
      const update = itemsMap.get(item.inventoryItemId);
      if (update) {
        item.actualClosingStock = update.actualClosingStock;
        if (item.expectedClosingStock !== undefined) {
          item.variance = update.actualClosingStock - item.expectedClosingStock;
        }
        if (update.varianceReason) {
          item.varianceReason = update.varianceReason;
        }
      }
      return item;
    });

    // Recalculate summary
    audit.itemsWithVariance = audit.items.filter((item) => item.variance !== undefined && item.variance !== 0).length;

    // Calculate financial variance (simplified - using average price)
    let totalVarianceValue = 0;
    for (const item of audit.items) {
      if (item.variance !== undefined && item.variance !== 0) {
        const inventoryItem = await InventoryItem.findById(item.inventoryItemId);
        if (inventoryItem) {
          totalVarianceValue += Math.abs(item.variance * inventoryItem.sellingPrice);
        }
      }
    }
    audit.totalVarianceValue = totalVarianceValue;

    audit.status = "COMPLETED";
    await audit.save();

    // Check for mismatches and create alerts
    if (audit.itemsWithVariance > 0) {
      await createActivity(
        "AUDIT_MISMATCH",
        "Audit Mismatch Detected",
        `Audit for ${audit.pharmacyId} has ${audit.itemsWithVariance} items with variance`,
        {
          pharmacyId: audit.pharmacyId,
          metadata: {
            auditId: String(audit._id),
            itemsWithVariance: audit.itemsWithVariance,
            totalVarianceValue,
          },
        }
      );
    }

    res.json(audit);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

// Update manual bills quantity
router.patch("/:id/manual-bills", requireAuth, requireRole(["SUPER_ADMIN", "PHARMACY_STAFF"]), async (req: Request, res: Response) => {
  try {
    const { items } = req.body; // Array of { inventoryItemId, manualBills }

    const audit = await StockAudit.findById(req.params.id);
    if (!audit) {
      return res.status(404).json({ message: "Audit not found" });
    }

    const itemsMap = new Map(items.map((item: any) => [item.inventoryItemId, item]));

    audit.items = audit.items.map((item) => {
      const update = itemsMap.get(item.inventoryItemId);
      if (update) {
        item.manualBills = update.manualBills;
        item.totalSales = item.systemSales + item.manualBills;
        item.expectedClosingStock = item.openingStock - item.totalSales;
        if (item.actualClosingStock !== undefined) {
          item.variance = item.actualClosingStock - item.expectedClosingStock;
        }
      }
      return item;
    });

    await audit.save();
    res.json(audit);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

// Get audit by ID
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const audit = await StockAudit.findById(req.params.id);
    if (!audit) {
      return res.status(404).json({ message: "Audit not found" });
    }
    res.json(audit);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

// List audits
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { pharmacyId, auditType, status, startDate, endDate, limit = 50 } = req.query;
    const filter: any = {};

    if (pharmacyId) filter.pharmacyId = pharmacyId;
    if (auditType) filter.auditType = auditType;
    if (status) filter.status = status;

    if (startDate || endDate) {
      filter.auditDate = {};
      if (startDate) filter.auditDate.$gte = new Date(startDate as string);
      if (endDate) filter.auditDate.$lte = new Date(endDate as string);
    }

    const audits = await StockAudit.find(filter)
      .sort({ auditDate: -1, createdAt: -1 })
      .limit(Number(limit));

    res.json(audits);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

// Review audit (mark as reviewed)
router.patch("/:id/review", requireAuth, requireRole(["SUPER_ADMIN", "PHARMACY_MANAGER"]), async (req: Request, res: Response) => {
  try {
    const { reviewedNotes } = req.body;
    const userId = (req as any).user?.userId;

    const audit = await StockAudit.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          status: "REVIEWED",
          reviewedBy: userId,
          reviewedAt: new Date(),
          reviewedNotes,
        },
      },
      { new: true }
    );

    if (!audit) {
      return res.status(404).json({ message: "Audit not found" });
    }

    res.json(audit);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

