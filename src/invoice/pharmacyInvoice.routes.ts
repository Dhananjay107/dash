import { Router, Request, Response } from "express";
import { PharmacyInvoice, IPharmacyInvoice } from "./pharmacyInvoice.model";
import { InventoryItem } from "../inventory/inventory.model";
import { requireAuth, requireRole } from "../shared/middleware/auth";
import { createActivity } from "../activity/activity.service";
import { generatePharmacyInvoicePDF } from "../invoice/pharmacyInvoicePDF";
import { Pharmacy } from "../master/pharmacy.model";
import { User } from "../user/user.model";

export const router = Router();

// Create pharmacy invoice
router.post("/", requireAuth, requireRole(["SUPER_ADMIN", "PHARMACY_STAFF"]), async (req: Request, res: Response) => {
  try {
    const {
      pharmacyId,
      patientId,
      orderId,
      invoiceType,
      items,
      paymentMethod,
      paymentStatus,
      paidAmount,
      billDate,
      notes,
    } = req.body;

    const userId = (req as any).user?.userId;

    // Validate and enrich items with inventory data
    const enrichedItems = await Promise.all(
      items.map(async (item: any) => {
        const inventoryItem = await InventoryItem.findById(item.inventoryItemId);
        if (!inventoryItem) {
          throw new Error(`Inventory item not found: ${item.inventoryItemId}`);
        }

        if (inventoryItem.quantity < item.quantity) {
          throw new Error(`Insufficient stock for ${inventoryItem.medicineName}. Available: ${inventoryItem.quantity}, Requested: ${item.quantity}`);
        }

        const sellingPrice = item.sellingPrice || inventoryItem.sellingPrice;
        const mrp = item.mrp || inventoryItem.mrp || inventoryItem.sellingPrice;
        const discount = item.discount || 0;
        const discountAmount = (mrp * item.quantity * discount) / 100;
        const subtotal = mrp * item.quantity - discountAmount;
        const taxRate = item.taxRate || 18; // Default 18% GST
        const taxAmount = (subtotal * taxRate) / 100;
        const total = subtotal + taxAmount;

        return {
          inventoryItemId: String(inventoryItem._id),
          medicineName: inventoryItem.medicineName,
          composition: inventoryItem.composition,
          brandName: inventoryItem.brandName,
          batchNumber: inventoryItem.batchNumber,
          expiryDate: inventoryItem.expiryDate,
          quantity: item.quantity,
          mrp,
          sellingPrice,
          discount,
          discountAmount,
          purchasePrice: inventoryItem.purchasePrice,
          margin: inventoryItem.margin || 0,
          taxRate,
          taxAmount,
          subtotal,
          total,
          rackNumber: inventoryItem.rackNumber,
          rowNumber: inventoryItem.rowNumber,
        };
      })
    );

    // Calculate totals
    const subtotal = enrichedItems.reduce((sum, item) => sum + item.subtotal, 0);
    const totalDiscount = enrichedItems.reduce((sum, item) => sum + item.discountAmount, 0);
    const totalTax = enrichedItems.reduce((sum, item) => sum + item.taxAmount, 0);
    const grandTotal = enrichedItems.reduce((sum, item) => sum + item.total, 0);

    // Create invoice
    const invoice = await PharmacyInvoice.create({
      pharmacyId,
      patientId,
      orderId,
      invoiceType: invoiceType || "WALK_IN",
      items: enrichedItems,
      subtotal,
      totalDiscount,
      totalTax,
      grandTotal,
      paymentMethod,
      paymentStatus: paymentStatus || "PENDING",
      paidAmount: paidAmount || 0,
      billDate: billDate || new Date(),
      createdBy: userId,
      notes,
    } as IPharmacyInvoice);

    // Update inventory quantities
    await Promise.all(
      enrichedItems.map(async (item) => {
        await InventoryItem.findByIdAndUpdate(item.inventoryItemId, {
          $inc: { quantity: -item.quantity },
        });
      })
    );

    // Create activity
    await createActivity(
      "PHARMACY_INVOICE_CREATED",
      "Pharmacy Invoice Created",
      `Invoice ${invoice.invoiceNumber} created for ₹${grandTotal}`,
      {
        pharmacyId,
        metadata: {
          invoiceId: String(invoice._id),
          invoiceNumber: invoice.invoiceNumber,
          grandTotal,
        },
      }
    );

    res.status(201).json(invoice);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

// Get invoice by ID
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const invoice = await PharmacyInvoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    res.json(invoice);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

// List invoices with filters
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { pharmacyId, patientId, orderId, invoiceType, paymentStatus, startDate, endDate, limit = 100 } = req.query;
    const filter: any = {};

    if (pharmacyId) filter.pharmacyId = pharmacyId;
    if (patientId) filter.patientId = patientId;
    if (orderId) filter.orderId = orderId;
    if (invoiceType) filter.invoiceType = invoiceType;
    if (paymentStatus) filter.paymentStatus = paymentStatus;

    if (startDate || endDate) {
      filter.billDate = {};
      if (startDate) filter.billDate.$gte = new Date(startDate as string);
      if (endDate) filter.billDate.$lte = new Date(endDate as string);
    }

    const invoices = await PharmacyInvoice.find(filter)
      .sort({ billDate: -1, createdAt: -1 })
      .limit(Number(limit));

    res.json(invoices);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

// Update payment status
router.patch("/:id/payment", requireAuth, requireRole(["SUPER_ADMIN", "PHARMACY_STAFF"]), async (req: Request, res: Response) => {
  try {
    const { paymentStatus, paidAmount, paymentMethod } = req.body;

    const invoice = await PharmacyInvoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    const update: any = {};
    if (paymentStatus) update.paymentStatus = paymentStatus;
    if (paidAmount !== undefined) update.paidAmount = paidAmount;
    if (paymentMethod) update.paymentMethod = paymentMethod;

    const updatedInvoice = await PharmacyInvoice.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true }
    );

    res.json(updatedInvoice);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

// Generate PDF invoice
router.get("/:id/pdf", requireAuth, async (req: Request, res: Response) => {
  try {
    const invoice = await PharmacyInvoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    // Get pharmacy info
    let pharmacyInfo;
    try {
      const pharmacy = await Pharmacy.findById(invoice.pharmacyId);
      if (pharmacy) {
        pharmacyInfo = {
          name: pharmacy.name,
          address: pharmacy.address,
          phone: pharmacy.phone,
        };
      }
    } catch (e) {
      // Silently fail
    }

    // Get patient info if available
    let patientInfo;
    if (invoice.patientId) {
      try {
        const patient = await User.findById(invoice.patientId);
        if (patient) {
          patientInfo = {
            name: patient.name,
            email: patient.email,
            phone: patient.phone,
          };
        }
      } catch (e) {
        // Silently fail
      }
    }

    // Generate PDF
    const pdfBuffer = await generatePharmacyInvoicePDF(invoice, pharmacyInfo, patientInfo);

    // Set response headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);

    res.send(pdfBuffer);
  } catch (error: any) {
    console.error("Error generating pharmacy invoice PDF:", error);
    res.status(500).json({ message: "Failed to generate invoice", error: error.message });
  }
});

