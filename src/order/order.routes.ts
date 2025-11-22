import { Router } from "express";
import { Order, IOrder } from "./order.model";
import { requireAuth, requireRole } from "../shared/middleware/auth";
import { createActivity } from "../activity/activity.service";
import { socketEvents } from "../socket/socket.server";

export const router = Router();

// Helper function to get order ID as string
const getOrderId = (order: IOrder): string => String(order._id);

// Helper function to get short order ID (last 8 chars)
const getShortOrderId = (order: IOrder): string => String(order._id).slice(-8);

// Helper function to emit order status update events
const emitOrderStatusUpdate = (order: IOrder, status: string, additionalData?: any) => {
  const orderId = getOrderId(order);
  const baseData = {
    orderId,
    status,
    pharmacyId: order.pharmacyId,
    ...additionalData,
  };

  socketEvents.emitToUser(order.patientId, "order:statusUpdated", baseData);
  socketEvents.emitToAdmin("order:statusUpdated", {
    ...baseData,
    patientId: order.patientId,
  });

  if (status === "SENT_TO_PHARMACY") {
    socketEvents.emitToRole("PHARMACY_STAFF", "order:statusUpdated", {
      ...baseData,
      patientId: order.patientId,
    });
  }
};

// Helper function to emit order created events
const emitOrderCreated = (order: IOrder) => {
  const orderId = getOrderId(order);
  const createdAt = (order as any).createdAt || new Date();
  const data = {
    orderId,
    patientId: order.patientId,
    pharmacyId: order.pharmacyId,
    status: order.status,
    itemCount: order.items.length,
    createdAt,
  };

  socketEvents.emitToAdmin("order:created", data);
  socketEvents.emitToUser(order.patientId, "order:created", {
    orderId: data.orderId,
    pharmacyId: data.pharmacyId,
    status: data.status,
    itemCount: data.itemCount,
    createdAt: data.createdAt,
  });
};

// Helper function to emit order cancelled events
const emitOrderCancelled = (order: IOrder) => {
  const orderId = getOrderId(order);
  socketEvents.emitToUser(order.patientId, "order:cancelled", {
    orderId,
    status: "CANCELLED",
    pharmacyId: order.pharmacyId,
  });
  socketEvents.emitToAdmin("order:cancelled", {
    orderId,
    patientId: order.patientId,
    pharmacyId: order.pharmacyId,
  });
};

// Patient creates an order from prescription
router.post(
  "/",
  requireAuth,
  requireRole(["PATIENT"]),
  async (req, res) => {
    try {
      const { pharmacyId, ...orderData } = req.body;
      
      if (!pharmacyId) {
        return res.status(400).json({ message: "pharmacyId is required" });
      }
      
      const order = await Order.create({
        ...orderData,
        patientId: req.user!.sub,
        status: "PENDING",
      });
      
      await createActivity(
        "ORDER_CREATED",
        "New Order Created",
        `Patient ${order.patientId} created order. Waiting for admin approval.`,
        {
          patientId: order.patientId,
          pharmacyId: order.pharmacyId,
          metadata: { orderId: getOrderId(order), itemCount: order.items.length },
        }
      );

      emitOrderCreated(order);
      
      res.status(201).json(order);
    } catch (error: any) {
      console.error("Error creating order:", error);
      res.status(500).json({ message: "Failed to create order", error: error.message });
    }
  }
);

// Get orders (with auth - for mobile app compatibility)
// Must come before /my route
router.get(
  "/",
  requireAuth,
  async (req, res) => {
    try {
      const { patientId, pharmacyId } = req.query;
      
      if (patientId && req.user!.sub === patientId) {
        const orders = await Order.find({ patientId: String(patientId) })
          .sort({ createdAt: -1 })
          .limit(50);
        return res.json(orders);
      }
      
      if (req.user!.role === "PHARMACY_STAFF" || req.user!.role === "SUPER_ADMIN") {
        const filter: any = {};
        if (patientId) filter.patientId = String(patientId);
        if (pharmacyId) filter.pharmacyId = String(pharmacyId);
        const orders = await Order.find(filter)
          .sort({ createdAt: -1 })
          .limit(100);
        return res.json(orders);
      }
      
      res.json([]);
    } catch (error: any) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders", error: error.message });
    }
  }
);

// Patient views own orders
router.get(
  "/my",
  requireAuth,
  async (req, res) => {
    try {
      const orders = await Order.find({ patientId: req.user!.sub })
        .sort({ createdAt: -1 })
        .limit(50);
      res.json(orders);
    } catch (error: any) {
      console.error("Error fetching user orders:", error);
      res.status(500).json({ message: "Failed to fetch orders", error: error.message });
    }
  }
);

// Pharmacy views orders to fulfill
router.get(
  "/by-pharmacy/:pharmacyId",
  requireAuth,
  requireRole(["PHARMACY_STAFF", "SUPER_ADMIN"]),
  async (req, res) => {
    try {
      const { pharmacyId } = req.params;
      const orders = await Order.find({ pharmacyId })
        .sort({ createdAt: -1 })
        .limit(100);
      res.json(orders);
    } catch (error: any) {
      console.error("Error fetching orders by pharmacy:", error);
      res.status(500).json({ message: "Failed to fetch orders", error: error.message });
    }
  }
);

// Admin status update helper
const adminStatusUpdate = async (
  req: any,
  res: any,
  currentStatus: string,
  newStatus: string,
  activityTitle: string,
  activityDescription: string,
  updateFields: any
) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    
    if (order.status !== currentStatus) {
      return res.status(400).json({ 
        message: `Order must be ${currentStatus}. Current status: ${order.status}` 
      });
    }
    
    const updated = await Order.findByIdAndUpdate(
      req.params.id,
      { status: newStatus, ...updateFields },
      { new: true }
    );
    
    await createActivity(
      "ORDER_STATUS_UPDATED",
      activityTitle,
      activityDescription.replace("{shortId}", getShortOrderId(order)),
      {
        patientId: order.patientId,
        pharmacyId: order.pharmacyId,
        metadata: { orderId: getOrderId(order), status: newStatus },
      }
    );

    emitOrderStatusUpdate(order, newStatus);
    
    res.json(updated);
  } catch (error: any) {
    console.error(`Error updating order status to ${newStatus}:`, error);
    res.status(500).json({ message: "Failed to update order", error: error.message });
  }
};

// Admin accepts order (changes PENDING to ORDER_RECEIVED)
router.patch(
  "/:id/admin-accept",
  requireAuth,
  requireRole(["SUPER_ADMIN"]),
  async (req, res) => {
    await adminStatusUpdate(
      req,
      res,
      "PENDING",
      "ORDER_RECEIVED",
      "Order Received by Admin",
      "Order {shortId} received and accepted by admin",
      { adminApprovedAt: new Date() }
    );
  }
);

// Admin marks medicine as received from supplier
router.patch(
  "/:id/admin-receive-medicine",
  requireAuth,
  requireRole(["SUPER_ADMIN"]),
  async (req, res) => {
    await adminStatusUpdate(
      req,
      res,
      "ORDER_RECEIVED",
      "MEDICINE_RECEIVED",
      "Medicine Received",
      "Medicine for order {shortId} received from supplier",
      { medicineReceivedAt: new Date() }
    );
  }
);

// Admin sends order to pharmacy
router.patch(
  "/:id/admin-send-to-pharmacy",
  requireAuth,
  requireRole(["SUPER_ADMIN"]),
  async (req, res) => {
    await adminStatusUpdate(
      req,
      res,
      "MEDICINE_RECEIVED",
      "SENT_TO_PHARMACY",
      "Order Sent to Pharmacy",
      "Order {shortId} sent to pharmacy for processing",
      { sentToPharmacyAt: new Date() }
    );
  }
);

// Pharmacy updates order status
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
      
      if (status === "ACCEPTED" && order.status !== "SENT_TO_PHARMACY") {
        return res.status(400).json({ 
          message: `Order must be SENT_TO_PHARMACY to accept. Current status: ${order.status}` 
        });
      }
      
      const updateData: any = { status };
      
      if (status === "OUT_FOR_DELIVERY") {
        if (deliveryPersonId) updateData.deliveryPersonId = deliveryPersonId;
        if (deliveryPersonName) updateData.deliveryPersonName = deliveryPersonName;
        if (deliveryPersonPhone) updateData.deliveryPersonPhone = deliveryPersonPhone;
        if (estimatedDeliveryTime) updateData.estimatedDeliveryTime = new Date(estimatedDeliveryTime);
        if (deliveryNotes) updateData.deliveryNotes = deliveryNotes;
      }
      
      if (status === "DELIVERED") {
        updateData.deliveredAt = new Date();
        if (deliveryNotes) updateData.deliveryNotes = deliveryNotes;
      }
      
      const updated = await Order.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true }
      );
      
      let description = `Order ${getShortOrderId(order)} status changed to ${status}`;
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
            orderId: getOrderId(order), 
            status,
            deliveryPersonName: updated?.deliveryPersonName,
            estimatedDeliveryTime: updated?.estimatedDeliveryTime,
          },
        }
      );

      emitOrderStatusUpdate(order, status, {
        deliveryPersonName: updated?.deliveryPersonName,
        estimatedDeliveryTime: updated?.estimatedDeliveryTime,
        deliveredAt: updated?.deliveredAt,
      });
      
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating order status:", error);
      res.status(500).json({ message: "Failed to update order status", error: error.message });
    }
  }
);

// Patient cancels own order
router.patch(
  "/:id/cancel",
  requireAuth,
  async (req, res) => {
    try {
      const { cancellationReason } = req.body;
      const order = await Order.findById(req.params.id);
      
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.patientId !== req.user!.sub && req.user!.role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "You can only cancel your own orders" });
      }

      const nonCancellableStatuses = ["DELIVERED", "CANCELLED", "OUT_FOR_DELIVERY"];
      if (nonCancellableStatuses.includes(order.status)) {
        return res.status(400).json({ 
          message: `Cannot cancel order. Current status: ${order.status}` 
        });
      }

      const updated = await Order.findByIdAndUpdate(
        req.params.id,
        { 
          status: "CANCELLED",
          cancellationReason: cancellationReason || "Cancelled by patient",
          cancelledAt: new Date(),
        },
        { new: true }
      );

      const cancelledBy = req.user!.role === "SUPER_ADMIN" ? "admin" : "patient";
      await createActivity(
        "ORDER_STATUS_UPDATED",
        "Order Cancelled",
        `Order ${getShortOrderId(order)} cancelled by ${cancelledBy}`,
        {
          patientId: order.patientId,
          pharmacyId: order.pharmacyId,
          metadata: { 
            orderId: getOrderId(order), 
            status: "CANCELLED",
            cancellationReason: cancellationReason || "Cancelled by patient",
          },
        }
      );

      emitOrderCancelled(order);

      res.json(updated);
    } catch (error: any) {
      console.error("Error cancelling order:", error);
      res.status(500).json({ message: "Failed to cancel order", error: error.message });
    }
  }
);
