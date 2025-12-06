import { Router, Request, Response } from "express";
import { requireAuth, requireRole } from "../shared/middleware/auth";
import { AppError } from "../shared/middleware/errorHandler";
import { DoctorPatientHistory } from "../doctorHistory/doctorHistory.model";
import { Prescription } from "../prescription/prescription.model";
import { Appointment } from "../appointment/appointment.model";
import { User } from "../user/user.model";

const router = Router();

// Get patient's consultation history
router.get(
  "/",
  requireAuth,
  requireRole(["PATIENT"]),
  async (req: Request, res: Response) => {
    try {
      const patientId = req.user?.sub;
      if (!patientId) {
        throw new AppError("Patient ID not found", 401);
      }

      // Get history from doctor-patient history collection
      const historyRecords = await DoctorPatientHistory.find({ patientId })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

      // Get all appointments for this patient
      const appointments = await Appointment.find({ patientId })
        .sort({ scheduledAt: -1 })
        .limit(100)
        .lean();

      // Get all prescriptions for this patient
      const prescriptions = await Prescription.find({ patientId })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

      // Fetch doctor names for appointments and prescriptions
      const doctorIds = new Set<string>();
      appointments.forEach((apt: any) => doctorIds.add(apt.doctorId));
      prescriptions.forEach((pres: any) => doctorIds.add(pres.doctorId));
      historyRecords.forEach((hist: any) => doctorIds.add(hist.doctorId));

      const doctors = await User.find({ _id: { $in: Array.from(doctorIds) } })
        .select("_id name email")
        .lean();

      const doctorMap = new Map();
      doctors.forEach((doc: any) => {
        doctorMap.set(String(doc._id), doc);
      });

      // Combine and format history
      const combinedHistory: any[] = [];

      // Add history records
      historyRecords.forEach((record: any) => {
        const doctor = doctorMap.get(record.doctorId);
        combinedHistory.push({
          _id: record._id,
          type: record.historyType,
          doctorId: record.doctorId,
          doctorName: doctor?.name || "Unknown Doctor",
          doctorEmail: doctor?.email || "",
          date: record.createdAt,
          appointmentId: record.appointmentId,
          appointmentDate: record.appointmentDate,
          appointmentStatus: record.appointmentStatus,
          prescriptionId: record.prescriptionId,
          prescriptionItems: record.prescriptionItems || [],
          prescriptionNotes: record.prescriptionNotes,
          reportRequest: record.reportRequest,
          diagnosis: record.diagnosis,
          treatment: record.treatment,
          doctorNotes: record.doctorNotes,
          metadata: record.metadata || {},
        });
      });

      // Add appointments that might not be in history
      appointments.forEach((apt: any) => {
        const exists = combinedHistory.some(
          (h) => h.appointmentId === String(apt._id)
        );
        if (!exists) {
          const doctor = doctorMap.get(apt.doctorId);
          combinedHistory.push({
            _id: `apt_${apt._id}`,
            type: "APPOINTMENT",
            doctorId: apt.doctorId,
            doctorName: doctor?.name || "Unknown Doctor",
            doctorEmail: doctor?.email || "",
            date: apt.scheduledAt,
            appointmentId: String(apt._id),
            appointmentDate: apt.scheduledAt,
            appointmentStatus: apt.status,
            issue: apt.issue || apt.reason,
            channel: apt.channel,
          });
        }
      });

      // Add prescriptions that might not be in history
      prescriptions.forEach((pres: any) => {
        const exists = combinedHistory.some(
          (h) => h.prescriptionId === String(pres._id)
        );
        if (!exists) {
          const doctor = doctorMap.get(pres.doctorId);
          combinedHistory.push({
            _id: `pres_${pres._id}`,
            type: "PRESCRIPTION",
            doctorId: pres.doctorId,
            doctorName: doctor?.name || "Unknown Doctor",
            doctorEmail: doctor?.email || "",
            date: (pres as any).createdAt || new Date(),
            prescriptionId: String(pres._id),
            prescriptionItems: pres.items || [],
            prescriptionNotes: pres.notes || pres.suggestions,
            appointmentId: pres.appointmentId,
          });
        }
      });

      // Sort by date (most recent first)
      combinedHistory.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateB - dateA;
      });

      res.json(combinedHistory);
    } catch (error: any) {
      if (error instanceof AppError) {
        res.status(error.status).json({ message: error.message });
      } else {
        console.error("Error fetching patient history:", error);
        res.status(500).json({ message: error.message || "Failed to fetch patient history" });
      }
    }
  }
);

// Get patient's statistics
router.get(
  "/stats",
  requireAuth,
  requireRole(["PATIENT"]),
  async (req: Request, res: Response) => {
    try {
      const patientId = req.user?.sub;
      if (!patientId) {
        throw new AppError("Patient ID not found", 401);
      }

      const [totalConsultations, totalPrescriptions, totalAppointments] = await Promise.all([
        DoctorPatientHistory.countDocuments({ patientId }),
        Prescription.countDocuments({ patientId }),
        Appointment.countDocuments({ patientId }),
      ]);

      res.json({
        totalConsultations,
        totalPrescriptions,
        totalAppointments,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        res.status(error.status).json({ message: error.message });
      } else {
        res.status(500).json({ message: error.message || "Failed to fetch statistics" });
      }
    }
  }
);

export default router;

