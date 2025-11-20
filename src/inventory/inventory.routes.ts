import { Router } from "express";
import { InventoryItem } from "./inventory.model";
import { DistributorOrder } from "../distributor/distributorOrder.model";
import { createActivity } from "../activity/activity.service";

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

// List inventory for a pharmacy
router.get("/by-pharmacy/:pharmacyId", async (req, res) => {
  const items = await InventoryItem.find({ pharmacyId: req.params.pharmacyId })
    .sort({ medicineName: 1 })
    .limit(500);
  res.json(items);
});

// Decrease stock when pharmacy dispenses medicines
router.post("/:id/consume", async (req, res) => {
  const { quantity } = req.body;
  const item = await InventoryItem.findById(req.params.id);
  if (!item) {
    return res.status(404).json({ message: "Inventory item not found" });
  }

  item.quantity = Math.max(0, item.quantity - quantity);
  await item.save();

  // Auto-restock trigger
  if (item.quantity <= item.threshold && item.distributorId) {
    const order = await DistributorOrder.create({
      pharmacyId: item.pharmacyId,
      distributorId: item.distributorId,
      medicineName: item.medicineName,
      quantity: item.threshold * 3, // simple rule: restock 3x threshold
      status: "PENDING",
    });

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
          currentQuantity: item.quantity,
          threshold: item.threshold,
          orderId: order._id.toString(),
        },
      }
    );
  }

  res.json(item);
});


