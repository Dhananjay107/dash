import { Router } from "express";
import { Notification } from "./notification.model";
import { requireAuth, requireRole } from "../shared/middleware/auth";

export const router = Router();

// Other services can enqueue a notification
router.post(
  "/",
  requireAuth,
  requireRole(["SUPER_ADMIN", "HOSPITAL_ADMIN"]),
  async (req, res) => {
    const notif = await Notification.create(req.body);
    // Here we could integrate Twilio/WhatsApp SDKs; for now we mark as SENT for demo
    notif.status = "SENT";
    await notif.save();
    res.status(201).json(notif);
  }
);

router.get(
  "/",
  requireAuth,
  requireRole(["SUPER_ADMIN"]),
  async (_req, res) => {
    const notifications = await Notification.find().sort({ createdAt: -1 }).limit(200);
    res.json(notifications);
  }
);


