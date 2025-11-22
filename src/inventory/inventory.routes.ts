import { Router, Request, Response } from "express";
import { InventoryItem, IInventoryItem } from "./inventory.model";
import { DistributorOrder } from "../distributor/distributorOrder.model";
import { createActivity } from "../activity/activity.service";
import { requireAuth, requireRole } from "../shared/middleware/auth";

export const router = Router();

// Create or update inventory item
router.post("/", async (req: Request, res: Response) => {
  try {
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
    }) as IInventoryItem;

    res.status(201).json(item);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

// List all inventory items (with optional filters)
router.get("/", async (req: Request, res: Response) => {
  try {
    const { pharmacyId, medicineName, lowStock } = req.query;
    const filter: any = {};
    if (pharmacyId) filter.pharmacyId = pharmacyId;
    if (medicineName) filter.medicineName = { $regex: medicineName, $options: "i" };
    if (lowStock === "true") {
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
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

// List inventory for a pharmacy
router.get("/by-pharmacy/:pharmacyId", async (req: Request, res: Response) => {
  try {
    const items = await InventoryItem.find({ pharmacyId: req.params.pharmacyId })
      .sort({ medicineName: 1 })
      .limit(500);
    res.json(items);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

// Get inventory item by ID
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const item = await InventoryItem.findById(req.params.id) as IInventoryItem | null;
    if (!item) {
      return res.status(404).json({ message: "Inventory item not found" });
    }
    res.json(item);
  } catch (error: any) {
    res.status(400).json({ message: error.message || "Failed to fetch inventory item" });
  }
});

// Decrease stock when pharmacy dispenses medicines (with transaction)
router.post("/:id/consume", async (req: Request, res: Response) => {
  const { quantity } = req.body;
  
  try {
    const { TransactionService } = await import("../shared/services/transaction.service");
    
    // Use transaction to ensure atomicity
    const updatedItem = await TransactionService.executeTransaction(async (session) => {
      const item = await InventoryItem.findById(req.params.id).session(session) as IInventoryItem | null;
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
              orderId: String(order._id),
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
                userId: String(distributor._id),
                type: "INVENTORY_LOW_STOCK",
                title: "Low Stock Alert - New Order",
                message: `${item.medicineName} is below threshold at ${pharmacy?.name || "Pharmacy"}. Auto-restock order #${String(order._id).slice(-8)} created.`,
                channel: "PUSH",
                metadata: {
                  orderId: String(order._id),
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
                userId: String(admin._id),
                type: "INVENTORY_LOW_STOCK",
                title: "Low Stock Alert",
                message: `${item.medicineName} is below threshold at ${pharmacy?.name || "Pharmacy"}. Auto-restock order created.`,
                channel: "PUSH",
                metadata: {
                  orderId: String(order._id),
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
  async (req: Request, res: Response) => {
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
      ) as IInventoryItem | null;
      
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
            itemId: String(item._id),
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
  async (req: Request, res: Response) => {
    try {
      const itemId = req.params.id;
      const item = await InventoryItem.findById(itemId) as IInventoryItem | null;
      if (!item) {
        return res.status(404).json({ message: "Inventory item not found" });
      }

      // Store item info before deletion
      const itemInfo = {
        medicineName: item.medicineName,
        pharmacyId: item.pharmacyId,
        itemId: String(item._id),
      };

      // Delete the item
      const deleteResult = await InventoryItem.deleteOne({ _id: item._id });
      
      if (deleteResult.deletedCount === 0) {
        return res.status(500).json({ message: "Failed to delete inventory item" });
      }

      await createActivity(
        "INVENTORY_DELETED",
        "Inventory Deleted",
        `Inventory item ${itemInfo.medicineName} deleted from Pharmacy ${itemInfo.pharmacyId}`,
        {
          pharmacyId: itemInfo.pharmacyId,
          metadata: { 
            medicineName: itemInfo.medicineName,
            itemId: itemInfo.itemId,
          },
        }
      );

      res.json({ message: "Inventory item deleted successfully" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }
);
