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
