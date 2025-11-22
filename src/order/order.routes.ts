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
    try {
      const body = req.body;
      console.log("Creating order with data:", { ...body, patientId: req.user!.sub });
      
      if (!body.pharmacyId) {
        return res.status(400).json({ message: "pharmacyId is required" });
      }
      
      // Order starts as PENDING - admin needs to accept first
      const order = await Order.create({
        ...body,
        patientId: req.user!.sub,
        status: "PENDING", // Admin will accept and change to ORDER_RECEIVED
      });
      
      console.log(`Order created successfully: ${order._id} for pharmacy: ${order.pharmacyId}`);
      
      // Emit activity - order created, waiting for admin approval
      await createActivity(
        "ORDER_CREATED",
        "New Order Created",
        `Patient ${order.patientId} created order. Waiting for admin approval.`,
        {
          patientId: order.patientId,
          pharmacyId: order.pharmacyId,
          metadata: { orderId: order._id.toString(), itemCount: order.items.length },
        }
      );
      
      res.status(201).json(order);
    } catch (error: any) {
      console.error("Error creating order:", error);
      res.status(500).json({ message: "Failed to create order", error: error.message });
    }
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

// Pharmacy views orders to fulfill (also accessible by SUPER_ADMIN)
router.get(
  "/by-pharmacy/:pharmacyId",
  requireAuth,
  requireRole(["PHARMACY_STAFF", "SUPER_ADMIN"]),
  async (req, res) => {
    try {
      const pharmacyId = req.params.pharmacyId;
      console.log(`Fetching orders for pharmacy: ${pharmacyId}`);
      
      // Query by pharmacyId (handles both string and ObjectId)
      const orders = await Order.find({ pharmacyId: pharmacyId })
        .sort({ createdAt: -1 })
        .limit(100);
      
      console.log(`Found ${orders.length} orders for pharmacy ${pharmacyId}`);
      res.json(orders);
    } catch (error: any) {
      console.error("Error fetching orders by pharmacy:", error);
      res.status(500).json({ message: "Failed to fetch orders", error: error.message });
    }
  }
);

// Admin accepts order (changes PENDING to ORDER_RECEIVED)
router.patch(
  "/:id/admin-accept",
  requireAuth,
  requireRole(["SUPER_ADMIN"]),
  async (req, res) => {
    try {
      const order = await Order.findById(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      if (order.status !== "PENDING") {
        return res.status(400).json({ message: `Order is already ${order.status}. Cannot accept.` });
      }
      
      const updated = await Order.findByIdAndUpdate(
        req.params.id,
        { 
          status: "ORDER_RECEIVED",
          adminApprovedAt: new Date(),
        },
        { new: true }
      );
      
      await createActivity(
        "ORDER_STATUS_UPDATED",
        "Order Received by Admin",
        `Order ${order._id.slice(-8)} received and accepted by admin`,
        {
          patientId: order.patientId,
          pharmacyId: order.pharmacyId,
          metadata: { orderId: order._id.toString(), status: "ORDER_RECEIVED" },
        }
      );
      
      res.json(updated);
    } catch (error: any) {
      console.error("Error accepting order:", error);
      res.status(500).json({ message: "Failed to accept order", error: error.message });
    }
  }
);

// Admin marks medicine as received from supplier
router.patch(
  "/:id/admin-receive-medicine",
  requireAuth,
  requireRole(["SUPER_ADMIN"]),
  async (req, res) => {
    try {
      const order = await Order.findById(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      if (order.status !== "ORDER_RECEIVED") {
        return res.status(400).json({ message: `Order must be ORDER_RECEIVED. Current status: ${order.status}` });
      }
      
      const updated = await Order.findByIdAndUpdate(
        req.params.id,
        { 
          status: "MEDICINE_RECEIVED",
          medicineReceivedAt: new Date(),
        },
        { new: true }
      );
      
      await createActivity(
        "ORDER_STATUS_UPDATED",
        "Medicine Received",
        `Medicine for order ${order._id.slice(-8)} received from supplier`,
        {
          patientId: order.patientId,
          pharmacyId: order.pharmacyId,
          metadata: { orderId: order._id.toString(), status: "MEDICINE_RECEIVED" },
        }
      );
      
      res.json(updated);
    } catch (error: any) {
      console.error("Error marking medicine received:", error);
      res.status(500).json({ message: "Failed to update order", error: error.message });
    }
  }
);

// Admin sends order to pharmacy
router.patch(
  "/:id/admin-send-to-pharmacy",
  requireAuth,
  requireRole(["SUPER_ADMIN"]),
  async (req, res) => {
    try {
      const order = await Order.findById(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      if (order.status !== "MEDICINE_RECEIVED") {
        return res.status(400).json({ message: `Order must be MEDICINE_RECEIVED. Current status: ${order.status}` });
      }
      
      const updated = await Order.findByIdAndUpdate(
        req.params.id,
        { 
          status: "SENT_TO_PHARMACY",
          sentToPharmacyAt: new Date(),
        },
        { new: true }
      );
      
      await createActivity(
        "ORDER_STATUS_UPDATED",
        "Order Sent to Pharmacy",
        `Order ${order._id.slice(-8)} sent to pharmacy for processing`,
        {
          patientId: order.patientId,
          pharmacyId: order.pharmacyId,
          metadata: { orderId: order._id.toString(), status: "SENT_TO_PHARMACY" },
        }
      );
      
      res.json(updated);
    } catch (error: any) {
      console.error("Error sending to pharmacy:", error);
      res.status(500).json({ message: "Failed to send to pharmacy", error: error.message });
    }
  }
);

// Pharmacy updates order status (accepted, packed, out for delivery, delivered)
router.patch(
  "/:id/status",
  requireAuth,
  requireRole(["PHARMACY_STAFF", "SUPER_ADMIN"]),
  async (req, res) => {
    try {
      const { status, deliveryPersonId, deliveryPersonName, deliveryPersonPhone, estimatedDeliveryTime, deliveryNotes } = req.body;
      
      const order = await Order.findById(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      // Pharmacy can only accept orders that are SENT_TO_PHARMACY
      if (status === "ACCEPTED" && order.status !== "SENT_TO_PHARMACY") {
        return res.status(400).json({ message: `Order must be SENT_TO_PHARMACY to accept. Current status: ${order.status}` });
      }
      
      const updateData: any = { status };
      
      // If status is OUT_FOR_DELIVERY, add delivery person info
      if (status === "OUT_FOR_DELIVERY") {
        if (deliveryPersonId) updateData.deliveryPersonId = deliveryPersonId;
        if (deliveryPersonName) updateData.deliveryPersonName = deliveryPersonName;
        if (deliveryPersonPhone) updateData.deliveryPersonPhone = deliveryPersonPhone;
        if (estimatedDeliveryTime) updateData.estimatedDeliveryTime = new Date(estimatedDeliveryTime);
        if (deliveryNotes) updateData.deliveryNotes = deliveryNotes;
      }
      
      // If status is DELIVERED, set deliveredAt timestamp
      if (status === "DELIVERED") {
        updateData.deliveredAt = new Date();
        if (deliveryNotes) updateData.deliveryNotes = deliveryNotes;
      }
      
      const updated = await Order.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true }
      );
      
      // Create activity (will be fetched via polling on frontend)
      let description = `Order ${order._id.slice(-8)} status changed to ${status}`;
      if (status === "OUT_FOR_DELIVERY" && deliveryPersonName) {
        description += ` - Assigned to ${deliveryPersonName}`;
      }
      if (status === "DELIVERED") {
        description += " - Medicine delivered successfully";
      }
      
      await createActivity(
        "ORDER_STATUS_UPDATED",
        "Order Status Updated",
        description,
        {
          patientId: order.patientId,
          pharmacyId: order.pharmacyId,
          metadata: { 
            orderId: order._id.toString(), 
            status,
            deliveryPersonName: updated?.deliveryPersonName,
            estimatedDeliveryTime: updated?.estimatedDeliveryTime,
          },
        }
      );
      
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating order status:", error);
      res.status(500).json({ message: "Failed to update order status", error: error.message });
    }
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
    
    // For pharmacy staff or admin, allow querying by patientId or pharmacyId
    if (req.user!.role === "PHARMACY_STAFF" || req.user!.role === "SUPER_ADMIN") {
      const filter: any = {};
      if (patientId) filter.patientId = patientId;
      if (req.query.pharmacyId) filter.pharmacyId = req.query.pharmacyId;
      const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(100);
      return res.json(orders);
    }
    
    // Default: return empty array if no access
    res.json([]);
  }
);

