import { Router, Request, Response } from "express";
import { requireAuth, requireRole } from "../shared/middleware/auth";
import {
  createDoctorPatientHistory,
  getDoctorPatientHistory,
  getDoctorPatientCount,
  getDoctorStats,
  getPatientHistoryByDoctor,
} from "./doctorHistory.service";
import { AppError } from "../shared/middleware/errorHandler";
// Import model to ensure it's initialized
import "./doctorHistory.model";

const router = Router();

// Get doctor's patient history
router.get(
  "/",
  requireAuth,
  requireRole(["DOCTOR"]),
  async (req: Request, res: Response) => {
    try {
      const doctorId = req.user?.sub;
      if (!doctorId) {
        console.error("❌ Doctor ID not found. User object:", req.user);
        throw new AppError("Doctor ID not found", 401);
      }

      const { patientId, limit } = req.query;
      console.log("📋 Fetching history for doctor:", doctorId, "patientId:", patientId);
      
      const history = await getDoctorPatientHistory(
        doctorId,
        patientId as string | undefined,
        limit ? parseInt(limit as string) : 100
      );
      
      console.log("✅ Found", history.length, "history records");
      res.json(history);
    } catch (error: any) {
      if (error instanceof AppError) {
        res.status(error.status).json({ message: error.message });
      } else {
        res.status(500).json({ message: error.message || "Failed to fetch patient history" });
      }
    }
  }
);

// Get doctor's statistics
router.get(
  "/stats",
  requireAuth,
  requireRole(["DOCTOR"]),
  async (req: Request, res: Response) => {
    try {
      const doctorId = req.user?.sub;
      if (!doctorId) {
        console.error("❌ Doctor ID not found. User object:", req.user);
        throw new AppError("Doctor ID not found", 401);
      }

      const stats = await getDoctorStats(doctorId);
      res.json(stats);
    } catch (error: any) {
      if (error instanceof AppError) {
        res.status(error.status).json({ message: error.message });
      } else {
        res.status(500).json({ message: error.message || "Failed to fetch statistics" });
      }
    }
  }
);

// Get patient count
router.get(
  "/patient-count",
  requireAuth,
  requireRole(["DOCTOR"]),
  async (req: Request, res: Response) => {
    try {
      const doctorId = req.user?.sub;
      if (!doctorId) {
        console.error("❌ Doctor ID not found. User object:", req.user);
        throw new AppError("Doctor ID not found", 401);
      }

      const count = await getDoctorPatientCount(doctorId);
      res.json({ totalPatients: count });
    } catch (error: any) {
      if (error instanceof AppError) {
        res.status(error.status).json({ message: error.message });
      } else {
        res.status(500).json({ message: error.message || "Failed to fetch patient count" });
      }
    }
  }
);

// Get specific patient's history with this doctor
router.get(
  "/patient/:patientId",
  requireAuth,
  requireRole(["DOCTOR"]),
  async (req: Request, res: Response) => {
    try {
      const doctorId = req.user?.sub;
      if (!doctorId) {
        console.error("❌ Doctor ID not found. User object:", req.user);
        throw new AppError("Doctor ID not found", 401);
      }

      const { patientId } = req.params;
      const history = await getPatientHistoryByDoctor(doctorId, patientId);
      res.json(history);
    } catch (error: any) {
      if (error instanceof AppError) {
        res.status(error.status).json({ message: error.message });
      } else {
        res.status(500).json({ message: error.message || "Failed to fetch patient history" });
      }
    }
  }
);

export default router;

