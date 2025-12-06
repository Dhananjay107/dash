import { Router } from "express";
import { Notification } from "./notification.model";
import { createNotification } from "./notification.service";
import { requireAuth, requireRole } from "../shared/middleware/auth";
import { validateRequired } from "../shared/middleware/validation";

export const router = Router();

// Create notification (used by other services)
router.post(
  "/",
  requireAuth,
  requireRole(["SUPER_ADMIN", "HOSPITAL_ADMIN"]),
  validateRequired(["type", "title", "message"]),
  async (req, res) => {
    const notification = await createNotification({
      userId: req.body.userId,
      type: req.body.type,
      title: req.body.title,
      message: req.body.message,
      metadata: req.body.metadata,
      channel: req.body.channel || "PUSH",
    });
    res.status(201).json(notification);
  }
);

// Get notifications for a user
router.get(
  "/my",
  requireAuth,
  async (req, res) => {
    const notifications = await Notification.find({ userId: req.user!.sub })
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(notifications);
  }
);

// Get all notifications (Admin only)
router.get(
  "/",
  requireAuth,
  requireRole(["SUPER_ADMIN", "HOSPITAL_ADMIN"]),
  async (req, res) => {
    const { userId, status, channel } = req.query;
    const filter: any = {};
    if (userId) filter.userId = userId;
    if (status) filter.status = status;
    if (channel) filter.channel = channel;

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(200);
    res.json(notifications);
  }
);

// Mark notification as read
router.patch(
  "/:id/read",
  requireAuth,
  async (req, res) => {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { status: "READ" },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }
    res.json(notification);
  }
);

// Send notification to patient (Doctor/Admin)
router.post(
  "/send-to-patient",
  requireAuth,
  requireRole(["DOCTOR", "SUPER_ADMIN", "HOSPITAL_ADMIN"]),
  validateRequired(["patientId", "type", "title", "message"]),
  async (req, res) => {
    try {
      const { patientId, type, title, message, metadata } = req.body;
      const senderId = req.user!.sub;
      const senderRole = req.user!.role;

      // Create notification for patient
      const notification = await createNotification({
        userId: patientId,
        type: type || "GENERAL",
        title,
        message,
        metadata: {
          ...metadata,
          senderId,
          senderRole,
        },
        channel: "PUSH",
      });

      // Emit socket event to patient
      const { socketEvents } = await import("../socket/socket.server");
      socketEvents.emitToUser(patientId, "notification:new", {
        notificationId: String(notification._id),
        type: notification.type,
        title: notification.title,
        message: notification.message,
        createdAt: notification.createdAt,
      });

      res.status(201).json(notification);
    } catch (error: any) {
      console.error("Error sending notification to patient:", error);
      res.status(500).json({ message: error.message || "Failed to send notification" });
    }
  }
);

// Send report/medical bill notification (Admin)
router.post(
  "/send-report-bill",
  requireAuth,
  requireRole(["SUPER_ADMIN", "HOSPITAL_ADMIN"]),
  validateRequired(["patientId", "title", "message", "documentType"]),
  async (req, res) => {
    try {
      const { patientId, title, message, documentType, fileUrl, amount, metadata } = req.body;
      const senderId = req.user!.sub;

      // Determine notification type based on document type
      const notificationType = documentType === "MEDICAL_BILL" 
        ? "MEDICAL_BILL" 
        : documentType === "REPORT" 
        ? "REPORT_SENT" 
        : "DOCUMENT_SENT";

      // Create notification for patient
      const notification = await createNotification({
        userId: patientId,
        type: notificationType,
        title: title || (documentType === "MEDICAL_BILL" ? "Medical Bill Available" : "Report Available"),
        message: message || (documentType === "MEDICAL_BILL" 
          ? "Your medical bill is now available. Please check your documents."
          : "A new report has been sent to you. Please check your documents."),
        metadata: {
          documentType,
          fileUrl,
          amount,
          senderId,
          ...metadata,
        },
        channel: "PUSH",
      });

      // Emit socket event to patient
      const { socketEvents } = await import("../socket/socket.server");
      socketEvents.emitToUser(patientId, "notification:new", {
        notificationId: String(notification._id),
        type: notification.type,
        title: notification.title,
        message: notification.message,
        documentType,
        fileUrl,
        createdAt: notification.createdAt,
      });

      res.status(201).json(notification);
    } catch (error: any) {
      console.error("Error sending report/bill notification:", error);
      res.status(500).json({ message: error.message || "Failed to send notification" });
    }
  }
);