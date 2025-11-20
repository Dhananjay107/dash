import { Router } from "express";
import { Order } from "./order.model";
import { requireAuth, requireRole } from "../shared/middleware/auth";
import { createActivity } from "../activity/activity.service";

export const router = Router();

// Patient creates an order from prescription
router.post(
  "/",
  requireAuth,
  requireRole(["PATIENT"]),
  async (req, res) => {
    const body = req.body;
    const order = await Order.create({
      ...body,
      patientId: req.user!.sub,
    });
    
    // Emit activity
    await createActivity(
      "ORDER_CREATED",
      "New Order Created",
      `Patient ${order.patientId} created order at Pharmacy ${order.pharmacyId}`,
      {
        patientId: order.patientId,
        pharmacyId: order.pharmacyId,
        metadata: { orderId: order._id.toString(), itemCount: order.items.length },
      }
    );
    
    res.status(201).json(order);
  }
);

// Patient views own orders
router.get(
  "/my",
  requireAuth,
  requireRole(["PATIENT"]),
  async (req, res) => {
    const orders = await Order.find({ patientId: req.user!.sub })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(orders);
  }
);

// Pharmacy views orders to fulfill
router.get(
  "/by-pharmacy/:pharmacyId",
  requireAuth,
  requireRole(["PHARMACY_STAFF"]),
  async (req, res) => {
    const orders = await Order.find({ pharmacyId: req.params.pharmacyId })
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(orders);
  }
);

// Pharmacy updates order status (accepted, packed, out for delivery, delivered)
router.patch(
  "/:id/status",
  requireAuth,
  requireRole(["PHARMACY_STAFF"]),
  async (req, res) => {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    
    if (order) {
      await createActivity(
        "ORDER_STATUS_UPDATED",
        "Order Status Updated",
        `Order ${order._id} status changed to ${status}`,
        {
          patientId: order.patientId,
          pharmacyId: order.pharmacyId,
          metadata: { orderId: order._id.toString(), status },
        }
      );
    }
    
    res.json(order);
  }
);

// Get orders by patientId (for testing without auth - remove in production)
router.get("/", async (req, res) => {
  const { patientId } = req.query;
  if (patientId) {
    const orders = await Order.find({ patientId }).sort({ createdAt: -1 }).limit(50);
    return res.json(orders);
  }
  res.json([]);
});


