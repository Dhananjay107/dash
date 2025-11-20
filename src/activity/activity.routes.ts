import { Router } from "express";
import { getRecentActivities } from "./activity.service";

export const router = Router();

// Get recent activities for admin dashboard
router.get("/", async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const activities = await getRecentActivities(limit);
  res.json(activities);
});

