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
  async (req, res) => {
    // Allow any authenticated user to view their own orders
    // The patientId is taken from the JWT token (req.user.sub)
    // This works for PATIENT role users or any user querying their own data
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
      // Emit activity (this will also emit order:update Socket.IO event)
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

// Get orders by patientId (with auth - for mobile app compatibility)
router.get(
  "/",
  requireAuth,
  async (req, res) => {
    const { patientId } = req.query;
    
    // If patientId is provided and matches logged-in user, allow it
    // Otherwise, only allow if user is SUPER_ADMIN or PHARMACY_STAFF
    if (patientId && req.user!.sub === patientId) {
      const orders = await Order.find({ patientId }).sort({ createdAt: -1 }).limit(50);
      return res.json(orders);
    }
    
    // For pharmacy staff or admin, allow querying by patientId
    if (req.user!.role === "PHARMACY_STAFF" || req.user!.role === "SUPER_ADMIN") {
      const filter: any = {};
      if (patientId) filter.patientId = patientId;
      const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(100);
      return res.json(orders);
    }
    
    // Default: return empty array if no access
    res.json([]);
  }
);

