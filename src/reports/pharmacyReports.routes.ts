import { Router, Request, Response } from "express";
import { InventoryItem } from "../inventory/inventory.model";
import { PharmacyInvoice } from "../invoice/pharmacyInvoice.model";
import { StockAudit } from "../audit/audit.model";
import { requireAuth, requireRole } from "../shared/middleware/auth";

export const router = Router();

/**
 * Expiry Tracking Report
 * Shows medicines expiring within specified days
 */
router.get("/expiry-tracking", requireAuth, requireRole(["SUPER_ADMIN", "PHARMACY_STAFF"]), async (req: Request, res: Response) => {
  try {
    const { pharmacyId, days = 90, expiredOnly = false } = req.query;

    if (!pharmacyId) {
      return res.status(400).json({ message: "pharmacyId is required" });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiryThreshold = new Date();
    expiryThreshold.setDate(today.getDate() + Number(days));

    const filter: any = {
      pharmacyId,
      quantity: { $gt: 0 },
    };

    if (expiredOnly) {
      filter.expiryDate = { $lt: today };
    } else {
      filter.expiryDate = { $lte: expiryThreshold };
    }

    const items = await InventoryItem.find(filter).sort({ expiryDate: 1 });

    const report = items.map((item) => {
      const expiryDate = new Date(item.expiryDate);
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const isExpired = daysUntilExpiry < 0;
      const isExpiringSoon = daysUntilExpiry <= 30 && daysUntilExpiry >= 0;

      return {
        inventoryItemId: String(item._id),
        medicineName: item.medicineName,
        composition: item.composition,
        brandName: item.brandName,
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
        daysUntilExpiry: isExpired ? -Math.abs(daysUntilExpiry) : daysUntilExpiry,
        isExpired,
        isExpiringSoon,
        quantity: item.quantity,
        purchaseValue: item.quantity * item.purchasePrice,
        sellingValue: item.quantity * item.sellingPrice,
        potentialLoss: isExpired ? item.quantity * item.purchasePrice : 0,
        rackNumber: item.rackNumber,
        rowNumber: item.rowNumber,
      };
    });

    const totalValue = report.reduce((sum, item) => sum + item.purchaseValue, 0);
    const totalPotentialLoss = report.reduce((sum, item) => sum + item.potentialLoss, 0);
    const expiredCount = report.filter((item) => item.isExpired).length;
    const expiringSoonCount = report.filter((item) => item.isExpiringSoon).length;

    res.json({
      pharmacyId,
      reportDate: today,
      days: Number(days),
      items: report,
      summary: {
        totalItems: report.length,
        expiredCount,
        expiringSoonCount,
        totalValue,
        totalPotentialLoss,
      },
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * Brand-wise Margin Report
 * Shows profitability by brand
 */
router.get("/brand-margin", requireAuth, requireRole(["SUPER_ADMIN", "PHARMACY_STAFF"]), async (req: Request, res: Response) => {
  try {
    const { pharmacyId, startDate, endDate, composition } = req.query;

    if (!pharmacyId) {
      return res.status(400).json({ message: "pharmacyId is required" });
    }

    // Build date filter for invoices
    const dateFilter: any = { pharmacyId };
    if (startDate || endDate) {
      dateFilter.billDate = {};
      if (startDate) dateFilter.billDate.$gte = new Date(startDate as string);
      if (endDate) dateFilter.billDate.$lte = new Date(endDate as string);
    }

    // Get invoices in date range
    const invoices = await PharmacyInvoice.find(dateFilter);

    // Aggregate by brand and composition
    const brandMarginMap = new Map<string, any>();

    invoices.forEach((invoice) => {
      invoice.items.forEach((item) => {
        const key = `${item.composition}||${item.brandName || "Generic"}`;
        
        if (!brandMarginMap.has(key)) {
          brandMarginMap.set(key, {
            composition: item.composition,
            brandName: item.brandName || "Generic",
            totalQuantity: 0,
            totalRevenue: 0,
            totalCost: 0,
            totalMargin: 0,
            averageMargin: 0,
            invoiceCount: 0,
          });
        }

        const stats = brandMarginMap.get(key)!;
        stats.totalQuantity += item.quantity;
        stats.totalRevenue += item.total;
        stats.totalCost += item.purchasePrice * item.quantity;
        stats.totalMargin += item.total - item.purchasePrice * item.quantity;
        stats.invoiceCount += 1;
      });
    });

    // Calculate averages and percentages
    const brandMargins = Array.from(brandMarginMap.values()).map((stats) => {
      stats.marginAmount = stats.totalMargin;
      stats.marginPercentage = stats.totalCost > 0 ? (stats.totalMargin / stats.totalCost) * 100 : 0;
      stats.averageMargin = stats.invoiceCount > 0 ? stats.totalMargin / stats.invoiceCount : 0;
      return stats;
    });

    // Filter by composition if specified
    let filteredBrands = brandMargins;
    if (composition) {
      filteredBrands = brandMargins.filter((item) =>
        item.composition.toLowerCase().includes((composition as string).toLowerCase())
      );
    }

    // Sort by margin percentage (descending)
    filteredBrands.sort((a, b) => b.marginPercentage - a.marginPercentage);

    const totalRevenue = filteredBrands.reduce((sum, item) => sum + item.totalRevenue, 0);
    const totalCost = filteredBrands.reduce((sum, item) => sum + item.totalCost, 0);
    const totalMargin = filteredBrands.reduce((sum, item) => sum + item.marginAmount, 0);

    res.json({
      pharmacyId,
      startDate: startDate || null,
      endDate: endDate || null,
      composition: composition || null,
      brands: filteredBrands,
      summary: {
        totalBrands: filteredBrands.length,
        totalRevenue,
        totalCost,
        totalMargin,
        overallMarginPercentage: totalCost > 0 ? (totalMargin / totalCost) * 100 : 0,
      },
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * Batch-wise Stock Aging Report
 * Shows how long batches have been in stock
 */
router.get("/batch-aging", requireAuth, requireRole(["SUPER_ADMIN", "PHARMACY_STAFF"]), async (req: Request, res: Response) => {
  try {
    const { pharmacyId } = req.query;

    if (!pharmacyId) {
      return res.status(400).json({ message: "pharmacyId is required" });
    }

    const items = await InventoryItem.find({ pharmacyId, quantity: { $gt: 0 } }).sort({ createdAt: 1 });

    const today = new Date();
    const agingReport = items.map((item) => {
      const createdDate = new Date(item.createdAt || item.updatedAt || today);
      const daysInStock = Math.ceil((today.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
      const expiryDate = new Date(item.expiryDate);
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      // Aging categories
      let agingCategory = "FRESH";
      if (daysInStock > 180) agingCategory = "OLD";
      else if (daysInStock > 90) agingCategory = "MODERATE";
      else if (daysInStock > 30) agingCategory = "RECENT";

      return {
        inventoryItemId: String(item._id),
        medicineName: item.medicineName,
        composition: item.composition,
        brandName: item.brandName,
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
        daysInStock,
        daysUntilExpiry,
        agingCategory,
        quantity: item.quantity,
        stockValue: item.quantity * item.purchasePrice,
        rackNumber: item.rackNumber,
        rowNumber: item.rowNumber,
        receivedDate: item.createdAt,
      };
    });

    // Group by aging category
    const byCategory = agingReport.reduce((acc: any, item) => {
      if (!acc[item.agingCategory]) {
        acc[item.agingCategory] = [];
      }
      acc[item.agingCategory].push(item);
      return acc;
    }, {});

    const summary = {
      totalBatches: agingReport.length,
      totalStockValue: agingReport.reduce((sum, item) => sum + item.stockValue, 0),
      byCategory: Object.keys(byCategory).map((category) => ({
        category,
        count: byCategory[category].length,
        totalValue: byCategory[category].reduce((sum: number, item: any) => sum + item.stockValue, 0),
      })),
    };

    res.json({
      pharmacyId,
      reportDate: today,
      batches: agingReport,
      summary,
      byCategory,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * Daily Audit Mismatch Report
 * Shows audits with discrepancies
 */
router.get("/audit-mismatches", requireAuth, requireRole(["SUPER_ADMIN", "PHARMACY_STAFF"]), async (req: Request, res: Response) => {
  try {
    const { pharmacyId, startDate, endDate } = req.query;

    const filter: any = {
      status: { $in: ["COMPLETED", "REVIEWED", "DISPUTED"] },
      itemsWithVariance: { $gt: 0 }, // Only audits with mismatches
    };

    if (pharmacyId) filter.pharmacyId = pharmacyId;
    if (startDate || endDate) {
      filter.auditDate = {};
      if (startDate) filter.auditDate.$gte = new Date(startDate as string);
      if (endDate) filter.auditDate.$lte = new Date(endDate as string);
    }

    const audits = await StockAudit.find(filter).sort({ auditDate: -1 }).limit(100);

    const mismatchReports = audits.map((audit) => {
      const itemsWithVariance = audit.items.filter((item) => item.variance !== undefined && item.variance !== 0);

      return {
        auditId: String(audit._id),
        pharmacyId: audit.pharmacyId,
        auditDate: audit.auditDate,
        auditType: audit.auditType,
        status: audit.status,
        itemsWithVariance: audit.itemsWithVariance,
        totalVarianceValue: audit.totalVarianceValue,
        varianceItems: itemsWithVariance.map((item) => ({
          medicineName: item.medicineName,
          composition: item.composition,
          brandName: item.brandName,
          batchNumber: item.batchNumber,
          openingStock: item.openingStock,
          systemSales: item.systemSales,
          manualBills: item.manualBills,
          totalSales: item.totalSales,
          expectedClosingStock: item.expectedClosingStock,
          actualClosingStock: item.actualClosingStock,
          variance: item.variance,
          varianceReason: item.varianceReason,
        })),
        reviewedBy: audit.reviewedBy,
        reviewedAt: audit.reviewedAt,
        reviewedNotes: audit.reviewedNotes,
      };
    });

    const summary = {
      totalAudits: mismatchReports.length,
      totalItemsWithVariance: mismatchReports.reduce((sum, audit) => sum + audit.itemsWithVariance, 0),
      totalVarianceValue: mismatchReports.reduce((sum, audit) => sum + (audit.totalVarianceValue || 0), 0),
      byStatus: mismatchReports.reduce((acc: any, audit) => {
        acc[audit.status] = (acc[audit.status] || 0) + 1;
        return acc;
      }, {}),
    };

    res.json({
      startDate: startDate || null,
      endDate: endDate || null,
      audits: mismatchReports,
      summary,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * Super Admin: Branch-wise Stock Visibility
 */
router.get("/branch-stock", requireAuth, requireRole(["SUPER_ADMIN"]), async (req: Request, res: Response) => {
  try {
    const { Pharmacy } = await import("../master/pharmacy.model");

    const pharmacies = await Pharmacy.find({ isActive: true });

    const branchStock = await Promise.all(
      pharmacies.map(async (pharmacy) => {
        const items = await InventoryItem.find({ pharmacyId: String(pharmacy._id) });

        const today = new Date();
        const expiryThreshold = new Date();
        expiryThreshold.setDate(today.getDate() + 30);

        // Calculate expiry risks
        const expiringSoon = items.filter((item) => {
          const expiryDate = new Date(item.expiryDate);
          return expiryDate <= expiryThreshold && expiryDate >= today && item.quantity > 0;
        });

        const expired = items.filter((item) => {
          const expiryDate = new Date(item.expiryDate);
          return expiryDate < today && item.quantity > 0;
        });

        // Low stock items
        const lowStock = items.filter((item) => item.quantity <= item.threshold);

        // Calculate total stock value
        const totalStockValue = items.reduce((sum, item) => sum + item.quantity * item.purchasePrice, 0);

        return {
          pharmacyId: String(pharmacy._id),
          pharmacyName: pharmacy.name,
          address: pharmacy.address,
          phone: pharmacy.phone,
          totalItems: items.length,
          totalStockValue,
          lowStockCount: lowStock.length,
          expiringSoonCount: expiringSoon.length,
          expiredCount: expired.length,
          lowStockItems: lowStock.slice(0, 10).map((item) => ({
            medicineName: item.medicineName,
            quantity: item.quantity,
            threshold: item.threshold,
          })),
          expiringSoonItems: expiringSoon.slice(0, 10).map((item) => ({
            medicineName: item.medicineName,
            brandName: item.brandName,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate,
            quantity: item.quantity,
          })),
        };
      })
    );

    res.json({
      branches: branchStock,
      summary: {
        totalBranches: branchStock.length,
        totalLowStockItems: branchStock.reduce((sum, branch) => sum + branch.lowStockCount, 0),
        totalExpiringSoonItems: branchStock.reduce((sum, branch) => sum + branch.expiringSoonCount, 0),
        totalExpiredItems: branchStock.reduce((sum, branch) => sum + branch.expiredCount, 0),
      },
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

