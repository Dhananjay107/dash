import { Router } from "express";
import { InventoryItem } from "./inventory.model";
import { DistributorOrder } from "../distributor/distributorOrder.model";
import { createActivity } from "../activity/activity.service";
import { requireAuth, requireRole } from "../shared/middleware/auth";

export const router = Router();

// Create or update inventory item
router.post("/", async (req, res) => {
  const { pharmacyId, medicineName, batchNumber, expiryDate, quantity, threshold, distributorId } =
    req.body;

  const item = await InventoryItem.create({
    pharmacyId,
    medicineName,
    batchNumber,
    expiryDate,
    quantity,
    threshold,
    distributorId,
  });

  res.status(201).json(item);
});

// List all inventory items (with optional filters)
router.get("/", async (req, res) => {
  const { pharmacyId, medicineName, lowStock } = req.query;
  const filter: any = {};
  if (pharmacyId) filter.pharmacyId = pharmacyId;
  if (medicineName) filter.medicineName = { $regex: medicineName, $options: "i" };
  if (lowStock === "true") {
    // Find items where quantity <= threshold
    const items = await InventoryItem.find(filter)
      .sort({ medicineName: 1 })
      .limit(500);
    const lowStockItems = items.filter(item => item.quantity <= item.threshold);
    return res.json(lowStockItems);
  }

  const items = await InventoryItem.find(filter)
    .sort({ medicineName: 1 })
    .limit(500);
  res.json(items);
});

// List inventory for a pharmacy (must come before /:id route)
router.get("/by-pharmacy/:pharmacyId", async (req, res) => {
  const items = await InventoryItem.find({ pharmacyId: req.params.pharmacyId })
    .sort({ medicineName: 1 })
    .limit(500);
  res.json(items);
});

// Get inventory item by ID (must come after specific routes)
router.get("/:id", async (req, res) => {
  try {
    const item = await InventoryItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: "Inventory item not found" });
    }
    res.json(item);
  } catch (error: any) {
    res.status(400).json({ message: error.message || "Failed to fetch inventory item" });
  }
});

// Decrease stock when pharmacy dispenses medicines (with transaction)
router.post("/:id/consume", async (req, res) => {
  const { quantity } = req.body;
  
  try {
    const { TransactionService } = await import("../shared/services/transaction.service");
    
    // Use transaction to ensure atomicity
    const updatedItem = await TransactionService.executeTransaction(async (session) => {
      const item = await InventoryItem.findById(req.params.id).session(session);
      if (!item) {
        throw new Error("Inventory item not found");
      }

      const newQuantity = Math.max(0, item.quantity - quantity);
      item.quantity = newQuantity;
      await item.save({ session });

      // Auto-restock trigger (within same transaction)
      if (newQuantity <= item.threshold && item.distributorId) {
        const [order] = await DistributorOrder.create([{
          pharmacyId: item.pharmacyId,
          distributorId: item.distributorId,
          medicineName: item.medicineName,
          quantity: item.threshold * 3,
          status: "PENDING",
        }], { session });

        // Emit activity for low stock
        await createActivity(
          "INVENTORY_LOW_STOCK",
          "Low Stock Alert",
          `${item.medicineName} is below threshold at Pharmacy ${item.pharmacyId}. Auto-restock order created.`,
          {
            pharmacyId: item.pharmacyId,
            distributorId: item.distributorId,
            metadata: { 
              medicineName: item.medicineName,
              currentQuantity: newQuantity,
              threshold: item.threshold,
              orderId: order._id.toString(),
            },
          }
        );

        // Send notifications to Distributor and Super Admin (outside transaction)
        // We'll do this after the transaction commits to avoid blocking
        setImmediate(async () => {
          try {
            const { createNotification } = await import("../notifications/notification.service");
            const { User } = await import("../user/user.model");
            const { Pharmacy } = await import("../master/pharmacy.model");
            
            // Get distributor user (check by distributorId field if exists, or by role)
            const distributor = await User.findOne({ 
              role: "DISTRIBUTOR",
              $or: [
                { distributorId: item.distributorId },
                { _id: item.distributorId }
              ]
            });
            
            // Get pharmacy info
            const pharmacy = await Pharmacy.findById(item.pharmacyId);
            
            if (distributor) {
              await createNotification({
                userId: distributor._id.toString(),
                type: "INVENTORY_LOW_STOCK",
                title: "Low Stock Alert - New Order",
                message: `${item.medicineName} is below threshold at ${pharmacy?.name || "Pharmacy"}. Auto-restock order #${order._id.toString().slice(-8)} created.`,
                channel: "PUSH",
                metadata: {
                  orderId: order._id.toString(),
                  pharmacyId: item.pharmacyId,
                  medicineName: item.medicineName,
                  quantity: order.quantity,
                },
              });
            }
            
            // Notify Super Admin
            const superAdmins = await User.find({ role: "SUPER_ADMIN" });
            for (const admin of superAdmins) {
              await createNotification({
                userId: admin._id.toString(),
                type: "INVENTORY_LOW_STOCK",
                title: "Low Stock Alert",
                message: `${item.medicineName} is below threshold at ${pharmacy?.name || "Pharmacy"}. Auto-restock order created.`,
                channel: "PUSH",
                metadata: {
                  orderId: order._id.toString(),
                  pharmacyId: item.pharmacyId,
                  distributorId: item.distributorId,
                  medicineName: item.medicineName,
                },
              });
            }
          } catch (error) {
            console.error("Failed to send low stock notifications:", error);
          }
        });
      }
      
      return item;
    });

    res.json(updatedItem);
  } catch (error: any) {
    res.status(400).json({ message: error.message || "Failed to consume inventory" });
  }
});

// Update Inventory Item
router.patch(
  "/:id",
  requireAuth,
  requireRole(["SUPER_ADMIN", "PHARMACY_STAFF"]),
  async (req, res) => {
    try {
      const { medicineName, batchNumber, expiryDate, quantity, threshold, distributorId } = req.body;
      const update: any = {};
      
      if (medicineName !== undefined) update.medicineName = medicineName;
      if (batchNumber !== undefined) update.batchNumber = batchNumber;
      if (expiryDate !== undefined) update.expiryDate = expiryDate;
      if (quantity !== undefined) update.quantity = quantity;
      if (threshold !== undefined) update.threshold = threshold;
      if (distributorId !== undefined) update.distributorId = distributorId;

      const item = await InventoryItem.findByIdAndUpdate(
        req.params.id,
        { $set: update },
        { new: true, runValidators: true }
      );
      
      if (!item) {
        return res.status(404).json({ message: "Inventory item not found" });
      }

      await createActivity(
        "INVENTORY_UPDATED",
        "Inventory Updated",
        `Inventory item ${item.medicineName} updated at Pharmacy ${item.pharmacyId}`,
        {
          pharmacyId: item.pharmacyId,
          metadata: { 
            medicineName: item.medicineName,
            quantity: item.quantity,
            itemId: item._id.toString(),
          },
        }
      );

      res.json(item);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }
);

// Delete Inventory Item
router.delete(
  "/:id",
  requireAuth,
  requireRole(["SUPER_ADMIN", "PHARMACY_STAFF"]),
  async (req, res) => {
    try {
      const item = await InventoryItem.findById(req.params.id);
      if (!item) {
        return res.status(404).json({ message: "Inventory item not found" });
      }

      await InventoryItem.findByIdAndDelete(req.params.id);

      await createActivity(
        "INVENTORY_DELETED",
        "Inventory Deleted",
        `Inventory item ${item.medicineName} deleted from Pharmacy ${item.pharmacyId}`,
        {
          pharmacyId: item.pharmacyId,
          metadata: { 
            medicineName: item.medicineName,
            itemId: item._id.toString(),
          },
        }
      );

      res.json({ message: "Inventory item deleted successfully" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }
);

