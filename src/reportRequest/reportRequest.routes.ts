import { Router } from "express";
import { ReportRequest } from "./reportRequest.model";
import { requireAuth } from "../shared/middleware/auth";
import { AppError } from "../shared/middleware/errorHandler";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();

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
router.post("/", requireAuth, async (req, res) => {
  try {
    const { patientId, reportType, description } = req.body;
    const doctorId = req.user?.sub;

    if (!doctorId) {
      return res.status(401).json({ message: "Unauthenticated" });
    }

    if (!patientId || !reportType) {
      throw new AppError("Patient ID and report type are required", 400);
    }

    const reportRequest = await ReportRequest.create({
      doctorId,
      patientId,
      reportType,
      description,
      status: "PENDING",
    });

    res.status(201).json(reportRequest);
  } catch (error: any) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ message: error.message });
    } else {
      res.status(500).json({ message: error.message || "Failed to create report request" });
    }
  }
});

// Get report requests (Patient)
router.get("/", requireAuth, async (req, res) => {
  try {
    const { patientId, doctorId } = req.query;
    const userId = req.user?.sub;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      return res.status(401).json({ message: "Unauthenticated" });
    }

    let query: any = {};

    if (patientId) {
      // Patient viewing their own requests
      if (userRole === "PATIENT" && patientId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      query.patientId = patientId;
    } else if (doctorId) {
      // Doctor viewing their requests
      if (userRole === "DOCTOR" && doctorId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      query.doctorId = doctorId;
    } else {
      // Default: get requests for current user based on role
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
    res.status(500).json({ message: error.message || "Failed to fetch report requests" });
  }
});

// Upload report (Patient)
router.patch(
  "/:id/upload",
  requireAuth,
  upload.single("file"),
  async (req, res) => {
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
        // In production, upload to cloud storage (S3, Cloudinary, etc.)
        // For now, save file path
        fileUrl = `/uploads/reports/${req.file.filename}`;
        fileName = req.file.originalname;
      }

      reportRequest.status = "UPLOADED";
      reportRequest.uploadedAt = new Date();
      reportRequest.fileUrl = fileUrl;
      reportRequest.fileName = fileName;

      await reportRequest.save();

      res.json(reportRequest);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to upload report" });
    }
  }
);

// Mark report as reviewed (Doctor)
router.patch("/:id/review", requireAuth, async (req, res) => {
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

    res.json(reportRequest);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to review report" });
  }
});

// Delete report request
router.delete("/:id", requireAuth, async (req, res) => {
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
    if (reportRequest.fileUrl && fs.existsSync(reportRequest.fileUrl)) {
      fs.unlinkSync(reportRequest.fileUrl);
    }

    await ReportRequest.findByIdAndDelete(id);

    res.json({ message: "Report request deleted" });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to delete report request" });
  }
});

export { router };

