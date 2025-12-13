import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import { ReportRequest, IReportRequest } from "./reportRequest.model";
import { requireAuth } from "../shared/middleware/auth";
import { AppError } from "../shared/middleware/errorHandler";
import { socketEvents } from "../socket/socket.server";
import { User } from "../user/user.model";
import { createNotification } from "../notifications/notification.service";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();

// Helper function to get report request ID as string
const getReportRequestId = (reportRequest: IReportRequest): string => String(reportRequest._id);

// Helper function to get file system path from URL
const getFilePath = (fileUrl: string): string => {
  if (!fileUrl) return "";
  // Remove leading slash and convert URL path to filesystem path
  const relativePath = fileUrl.startsWith("/") ? fileUrl.slice(1) : fileUrl;
  return path.join(process.cwd(), relativePath);
};

// Configure multer for file uploads
const upload = multer({
  dest: "uploads/reports/",
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only images, PDFs, and documents are allowed."));
    }
  },
});

// Create report request (Doctor)
router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { patientId, reportType, description, appointmentId, conversationId } = req.body;
    const doctorId = req.user?.sub;

    if (!doctorId) {
      return res.status(401).json({ message: "Unauthenticated" });
    }

    if (!patientId || !reportType) {
      return res.status(400).json({ message: "Patient ID and report type are required" });
    }

    const reportRequest = await ReportRequest.create({
      doctorId,
      patientId,
      reportType,
      description,
      appointmentId,
      conversationId,
      status: "PENDING",
    });

    // Fetch doctor name for notification
    const doctor = await User.findById(doctorId).select("name").lean();
    const doctorName = doctor?.name || "Doctor";

    const patientIdStr = String(patientId);
    const requestId = getReportRequestId(reportRequest);

    // Create notification for patient
    await createNotification({
      userId: patientIdStr,
      type: "REPORT_REQUESTED",
      title: "Report Request from Doctor",
      message: `Dr. ${doctorName} has requested a ${reportType} report. ${description ? `Details: ${description}` : ""}`,
      metadata: {
        requestId,
        doctorId: String(doctorId),
        doctorName,
        reportType,
        description,
        requestedAt: reportRequest.requestedAt,
      },
      channel: "PUSH",
    });

    // Emit Socket.IO event to patient
    socketEvents.emitToUser(patientIdStr, "report:requested", {
      requestId,
      doctorId: String(doctorId),
      doctorName,
      reportType,
      description,
      requestedAt: reportRequest.requestedAt,
      patientId: patientIdStr,
    });

    // Also emit notification event
    socketEvents.emitToUser(patientIdStr, "notification:new", {
      type: "REPORT_REQUESTED",
      title: "Report Request from Doctor",
      message: `Dr. ${doctorName} has requested a ${reportType} report.`,
      requestId,
    });

    res.status(201).json(reportRequest);
  } catch (error: any) {
    console.error("Error creating report request:", error);
    if (error instanceof AppError) {
      res.status(error.status).json({ message: error.message });
    } else {
      res.status(500).json({ message: error.message || "Failed to create report request" });
    }
  }
});

// Get report requests
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { patientId, doctorId } = req.query;
    const userId = req.user?.sub;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      return res.status(401).json({ message: "Unauthenticated" });
    }

    let query: any = {};

    if (patientId) {
      if (userRole === "PATIENT" && patientId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      query.patientId = patientId;
    } else if (doctorId) {
      if (userRole === "DOCTOR" && doctorId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      query.doctorId = doctorId;
    } else {
      if (userRole === "PATIENT") {
        query.patientId = userId;
      } else if (userRole === "DOCTOR") {
        query.doctorId = userId;
      } else {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const requests = await ReportRequest.find(query)
      .sort({ requestedAt: -1 })
      .lean();

    res.json(requests);
  } catch (error: any) {
    console.error("Error fetching report requests:", error);
    res.status(500).json({ message: error.message || "Failed to fetch report requests" });
  }
});

// Upload report (Patient)
router.patch(
  "/:id/upload",
  requireAuth,
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user?.sub;
      const userRole = req.user?.role;

      if (!userId || !userRole) {
        return res.status(401).json({ message: "Unauthenticated" });
      }

      if (userRole !== "PATIENT") {
        return res.status(403).json({ message: "Only patients can upload reports" });
      }

      const reportRequest = await ReportRequest.findById(id);

      if (!reportRequest) {
        return res.status(404).json({ message: "Report request not found" });
      }

      if (reportRequest.patientId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (reportRequest.status !== "PENDING") {
        return res.status(400).json({ message: "Report already uploaded" });
      }

      let fileUrl = "";
      let fileName = "";

      if (req.file) {
        fileUrl = `/uploads/reports/${req.file.filename}`;
        fileName = req.file.originalname;
      } else {
        return res.status(400).json({ message: "File is required" });
      }

      reportRequest.status = "UPLOADED";
      reportRequest.uploadedAt = new Date();
      reportRequest.fileUrl = fileUrl;
      reportRequest.fileName = fileName;

      await reportRequest.save();

      // Fetch patient name for notification
      const patient = await User.findById(reportRequest.patientId).select("name").lean();
      const patientName = patient?.name || "Patient";

      // Create notification for doctor
      await createNotification({
        userId: reportRequest.doctorId,
        type: "REPORT_UPLOADED",
        title: "Report Uploaded",
        message: `${patientName} has uploaded the ${reportRequest.reportType} report you requested.`,
        metadata: {
          requestId: getReportRequestId(reportRequest),
          patientId: reportRequest.patientId,
          patientName,
          reportType: reportRequest.reportType,
          fileUrl: reportRequest.fileUrl,
          fileName: reportRequest.fileName,
        },
        channel: "PUSH",
      });

      // Emit Socket.IO event to doctor
      socketEvents.emitToUser(reportRequest.doctorId, "report:uploaded", {
        requestId: getReportRequestId(reportRequest),
        patientId: reportRequest.patientId,
        patientName,
        reportType: reportRequest.reportType,
        fileUrl: reportRequest.fileUrl,
        fileName: reportRequest.fileName,
        uploadedAt: reportRequest.uploadedAt,
      });

      // Also emit notification event
      socketEvents.emitToUser(reportRequest.doctorId, "notification:new", {
        type: "REPORT_UPLOADED",
        title: "Report Uploaded",
        message: `${patientName} has uploaded the ${reportRequest.reportType} report.`,
        requestId: getReportRequestId(reportRequest),
      });

      res.json(reportRequest);
    } catch (error: any) {
      console.error("Error uploading report:", error);
      res.status(500).json({ message: error.message || "Failed to upload report" });
    }
  }
);

// Mark report as reviewed (Doctor)
router.patch("/:id/review", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.sub;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      return res.status(401).json({ message: "Unauthenticated" });
    }

    if (userRole !== "DOCTOR") {
      return res.status(403).json({ message: "Only doctors can review reports" });
    }

    const reportRequest = await ReportRequest.findById(id);

    if (!reportRequest) {
      return res.status(404).json({ message: "Report request not found" });
    }

    if (reportRequest.doctorId !== userId) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (reportRequest.status !== "UPLOADED") {
      return res.status(400).json({ message: "Report must be uploaded before review" });
    }

    reportRequest.status = "REVIEWED";
    await reportRequest.save();

    // Emit Socket.IO event to patient
    socketEvents.emitToUser(reportRequest.patientId, "report:reviewed", {
      requestId: getReportRequestId(reportRequest),
      doctorId: reportRequest.doctorId,
      reviewedAt: new Date(),
    });

    res.json(reportRequest);
  } catch (error: any) {
    console.error("Error reviewing report:", error);
    res.status(500).json({ message: error.message || "Failed to review report" });
  }
});

// Delete report request
router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.sub;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      return res.status(401).json({ message: "Unauthenticated" });
    }

    const reportRequest = await ReportRequest.findById(id);

    if (!reportRequest) {
      return res.status(404).json({ message: "Report request not found" });
    }

    // Only doctor who created it or patient can delete
    if (
      (userRole === "DOCTOR" && reportRequest.doctorId !== userId) ||
      (userRole === "PATIENT" && reportRequest.patientId !== userId)
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Delete file if exists
    if (reportRequest.fileUrl) {
      try {
        const filePath = getFilePath(reportRequest.fileUrl);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (fileError: any) {
        console.error("Error deleting file:", fileError);
        // Continue with deletion even if file deletion fails
      }
    }

    const reportRequestObjectId = reportRequest._id as mongoose.Types.ObjectId;
    const reportRequestIdStr = getReportRequestId(reportRequest);

    // Try multiple deletion methods
    let deleted = false;
    let deleteResult: any = null;

    // Method 1: Standard deleteOne
    deleteResult = await ReportRequest.deleteOne({ _id: reportRequestObjectId });
    if (deleteResult.deletedCount > 0) {
      deleted = true;
    }

    // Method 2: Force delete using native collection if needed
    if (!deleted) {
      try {
        const db = mongoose.connection.db;
        if (db) {
          const collection = db.collection(ReportRequest.collection.name);
          const result = await collection.deleteOne(
            { _id: reportRequestObjectId },
            { w: 'majority', j: true } as any
          );
          if (result.deletedCount > 0) {
            deleted = true;
            deleteResult = result;
          }
        }
      } catch (collectionError: any) {
        console.error("Collection delete error:", collectionError);
      }
    }

    // Method 3: findByIdAndDelete as fallback
    if (!deleted) {
      const deletedDoc = await ReportRequest.findByIdAndDelete(reportRequestObjectId);
      if (deletedDoc) {
        deleted = true;
        deleteResult = { deletedCount: 1, acknowledged: true };
      }
    }

    // Verify deletion
    if (deleted) {
      await new Promise(resolve => setTimeout(resolve, 100));
      const verifyDelete = await ReportRequest.findById(reportRequestObjectId);
      if (verifyDelete) {
        console.error(`[DELETE] Critical: Report request ${reportRequestIdStr} still exists after deletion`);
        return res.status(500).json({ 
          message: "Failed to delete report request from database",
          error: "Document still exists after deletion attempt"
        });
      }
    } else {
      const checkExists = await ReportRequest.findById(reportRequestObjectId);
      if (!checkExists) {
        deleted = true;
      } else {
        return res.status(500).json({
          message: "Failed to delete report request from database",
          error: "All deletion methods returned deletedCount: 0",
          reportRequestId: reportRequestIdStr
        });
      }
    }

    res.json({ message: "Report request deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting report request:", error);
    res.status(500).json({ message: error.message || "Failed to delete report request" });
  }
});

export { router };
