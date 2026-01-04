import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

export const router = Router();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), "uploads", "prescriptions");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `prescription-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Accept images and PDFs
  if (file.mimetype.startsWith("image/") || file.mimetype === "application/pdf") {
    cb(null, true);
  } else {
    cb(new Error("Only image and PDF files are allowed"));
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter,
});

/**
 * Upload prescription image/PDF
 */
router.post("/prescription", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // In production, upload to cloud storage (AWS S3, Cloudinary, etc.)
    // For now, return the local file path
    const fileUrl = `/uploads/prescriptions/${req.file.filename}`;
    const fullUrl = `${req.protocol}://${req.get("host")}${fileUrl}`;

    res.json({
      success: true,
      url: fullUrl,
      fileUrl: fileUrl,
      filename: req.file.filename,
      size: req.file.size,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message || "Failed to upload file" });
  }
});

/**
 * Upload product image
 */
router.post("/product", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const fileUrl = `/uploads/products/${req.file.filename}`;
    const fullUrl = `${req.protocol}://${req.get("host")}${fileUrl}`;

    res.json({
      success: true,
      url: fullUrl,
      fileUrl: fileUrl,
      filename: req.file.filename,
      size: req.file.size,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message || "Failed to upload file" });
  }
});

