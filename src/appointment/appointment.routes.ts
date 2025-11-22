import { Router } from "express";
import mongoose from "mongoose";
import { Appointment } from "./appointment.model";
import { createActivity } from "../activity/activity.service";
import { sendAppointmentReminder } from "../notifications/notification.service";
import { validateRequired } from "../shared/middleware/validation";
import { AppError } from "../shared/middleware/errorHandler";
import { User } from "../user/user.model";
import { Conversation } from "../conversation/conversation.model";
import { Prescription } from "../prescription/prescription.model";
import { socketEvents } from "../socket/socket.server";
import multer from "multer";
import path from "path";
import fs from "fs";
import { Request } from "express";

// Helper function to force delete using native MongoDB driver
async function forceDeleteAppointment(appointmentId: string): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  try {
    const db = mongoose.connection.db;
    if (!db) {
      return { success: false, deletedCount: 0, error: "Database connection not available" };
    }

    // Use the model's collection name to ensure we're targeting the correct collection
    const collectionName = Appointment.collection.name;
    const collection = db.collection(collectionName);
    console.log(`[DELETE] Using collection: ${collectionName}`);
    
    let objectId: mongoose.Types.ObjectId;
    
    try {
      objectId = new mongoose.Types.ObjectId(appointmentId);
      console.log(`[DELETE] Converted to ObjectId: ${objectId}`);
    } catch (e) {
      return { success: false, deletedCount: 0, error: "Invalid ObjectId format" };
    }

    // Use write concern to ensure the delete is committed
    // Note: Write concern options may vary by MongoDB version
    const result = await collection.deleteOne(
      { _id: objectId },
      { w: 'majority', j: true } as any // Ensure write is acknowledged and journaled
    );
    
    console.log(`[DELETE] Native delete result:`, {
      deletedCount: result.deletedCount,
      acknowledged: result.acknowledged
    });
    
    return { 
      success: result.deletedCount > 0, 
      deletedCount: result.deletedCount 
    };
  } catch (error: any) {
    console.error(`[DELETE] Force delete error:`, error);
    return { 
      success: false, 
      deletedCount: 0, 
      error: error.message 
    };
  }
}

export const router = Router();

// Configure multer for file uploads
const upload = multer({
  dest: "uploads/reports/",
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req: Request, file: any, cb: any) => {
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

// Create appointment (Patient app, Admin portal)
router.post(
  "/",
  validateRequired(["hospitalId", "doctorId", "patientId", "scheduledAt", "patientName", "age", "address", "issue"]),
  async (req, res) => {
    const { scheduledAt, patientName, age, address, issue } = req.body;
    const appointmentDate = new Date(scheduledAt);
    
    if (isNaN(appointmentDate.getTime())) {
      throw new AppError("Invalid scheduledAt date", 400);
    }

    if (appointmentDate < new Date()) {
      throw new AppError("Appointment cannot be scheduled in the past", 400);
    }

    // Validate age
    if (!age || age < 0 || age > 150) {
      throw new AppError("Invalid age. Must be between 0 and 150", 400);
    }

    // Validate required fields
    if (!patientName || patientName.trim().length === 0) {
      throw new AppError("Patient name is required", 400);
    }
    if (!address || address.trim().length === 0) {
      throw new AppError("Address is required", 400);
    }
    if (!issue || issue.trim().length === 0) {
      throw new AppError("Issue description is required", 400);
    }

    const appointment = await Appointment.create({
      ...req.body,
      patientName: patientName.trim(),
      age: Number(age),
      address: address.trim(),
      issue: issue.trim(),
      // Set reason to issue for backward compatibility
      reason: issue.trim(),
    });
    
    // Emit activity
    await createActivity(
      "APPOINTMENT_CREATED",
      "New Appointment Created",
      `Patient ${appointment.patientId} booked appointment with Doctor ${appointment.doctorId}`,
      {
        patientId: appointment.patientId,
        doctorId: appointment.doctorId,
        hospitalId: appointment.hospitalId,
        metadata: { appointmentId: String(appointment._id) },
      }
    );

    // Schedule reminder notification (1 hour before)
    try {
      const patient = await User.findById(appointment.patientId);
      const doctor = await User.findById(appointment.doctorId);
      
      if (patient?.phone && doctor) {
        const reminderTime = new Date(appointmentDate.getTime() - 60 * 60 * 1000); // 1 hour before
        const now = new Date();
        
        if (reminderTime > now) {
          // In production, use a job scheduler (node-cron, Bull, etc.)
          setTimeout(async () => {
            await sendAppointmentReminder(
              appointment.patientId,
              patient.phone!,
              doctor.name,
              appointmentDate
            );
          }, reminderTime.getTime() - now.getTime());
        }
      }
    } catch (error) {
      console.error("Failed to schedule reminder:", error);
    }

    // Emit Socket.IO events
    socketEvents.emitToUser(appointment.doctorId, "appointment:created", {
      appointmentId: String(appointment._id),
      patientId: appointment.patientId,
      scheduledAt: appointment.scheduledAt,
      status: appointment.status,
    });
    socketEvents.emitToAdmin("appointment:created", {
      appointmentId: String(appointment._id),
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
      scheduledAt: appointment.scheduledAt,
      status: appointment.status,
    });
    
    res.status(201).json(appointment);
  }
);

// List appointments filtered by doctor/patient/hospital
router.get("/", async (req, res) => {
  const { doctorId, patientId, hospitalId, status } = req.query;

  const filter: any = {};
  if (doctorId) filter.doctorId = doctorId;
  if (patientId) filter.patientId = patientId;
  if (hospitalId) filter.hospitalId = hospitalId;
  if (status) filter.status = status;

  const items = await Appointment.find(filter).sort({ scheduledAt: 1 }).limit(100);
  res.json(items);
});

// Get appointment by ID
router.get("/:id", async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      throw new AppError("Appointment not found", 404);
    }
    res.json(appointment);
  } catch (error: any) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError("Failed to fetch appointment: " + error.message, 500);
  }
});

// Update status (Doctor & Admin)
router.patch("/:id/status", validateRequired(["status"]), async (req, res) => {
  const { status } = req.body;
  
  const validStatuses = ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED"];
  if (!validStatuses.includes(status)) {
    throw new AppError(`Invalid status. Must be one of: ${validStatuses.join(", ")}`, 400);
  }

  const appointment = await Appointment.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  );

  if (!appointment) {
    throw new AppError("Appointment not found", 404);
  }
  
  // Auto-create conversation when appointment is confirmed (for both ONLINE and OFFLINE)
  if (status === "CONFIRMED") {
    const existingConversation = await Conversation.findOne({
      appointmentId: String(appointment._id),
      isActive: true,
    });

    if (!existingConversation) {
      const conversationType = appointment.channel === "VIDEO" ? "ONLINE" : "OFFLINE";
      await Conversation.create({
        appointmentId: String(appointment._id),
        doctorId: appointment.doctorId,
        patientId: appointment.patientId,
        hospitalId: appointment.hospitalId,
        conversationType,
        messages: [],
        isActive: true,
        startedAt: new Date(),
      });

      await createActivity(
        "CONVERSATION_STARTED",
        "Consultation Started",
        `Conversation started for appointment ${String(appointment._id)}`,
        {
          appointmentId: String(appointment._id),
          doctorId: appointment.doctorId,
          patientId: appointment.patientId,
          hospitalId: appointment.hospitalId,
          metadata: { conversationType },
        }
      );
    }
  }

  // Emit Socket.IO events for status update
  socketEvents.emitToUser(appointment.patientId, "appointment:statusUpdated", {
    appointmentId: String(appointment._id),
    status,
    doctorId: appointment.doctorId,
    scheduledAt: appointment.scheduledAt,
  });
  socketEvents.emitToUser(appointment.doctorId, "appointment:statusUpdated", {
    appointmentId: String(appointment._id),
    status,
    patientId: appointment.patientId,
    scheduledAt: appointment.scheduledAt,
  });
  socketEvents.emitToAdmin("appointment:statusUpdated", {
    appointmentId: String(appointment._id),
    status,
    patientId: appointment.patientId,
    doctorId: appointment.doctorId,
  });

  // End conversation when appointment is completed or cancelled
  if (status === "COMPLETED" || status === "CANCELLED") {
    const conversation = await Conversation.findOne({
      appointmentId: String(appointment._id),
      isActive: true,
    });

    if (conversation) {
      conversation.isActive = false;
      conversation.endedAt = new Date();
      await conversation.save();
    }
  }

  // Create activity (will be fetched via polling on frontend)
  await createActivity(
    "APPOINTMENT_STATUS_UPDATED",
    "Appointment Status Updated",
        `Appointment ${String(appointment._id)} status changed to ${status}`,
    {
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
      hospitalId: appointment.hospitalId,
      metadata: { appointmentId: String(appointment._id), status },
    }
  );
  
  res.json(appointment);
});

// Reschedule appointment (Doctor & Admin)
router.patch("/:id/reschedule", validateRequired(["scheduledAt"]), async (req, res) => {
  const { scheduledAt } = req.body;
  const newDate = new Date(scheduledAt);
  
  if (isNaN(newDate.getTime())) {
    throw new AppError("Invalid scheduledAt date", 400);
  }

  const appointment = await Appointment.findByIdAndUpdate(
    req.params.id,
    { scheduledAt: newDate },
    { new: true }
  );

  if (!appointment) {
    throw new AppError("Appointment not found", 404);
  }
  
  await createActivity(
    "APPOINTMENT_RESCHEDULED",
    "Appointment Rescheduled",
    `Appointment rescheduled to ${newDate.toLocaleString()}`,
    {
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
      hospitalId: appointment.hospitalId,
      metadata: { appointmentId: String(appointment._id), newTime: scheduledAt },
    }
  );
  
  res.json(appointment);
});

// Cancel appointment (Doctor & Admin)
router.patch("/:id/cancel", validateRequired(["cancellationReason"]), async (req, res) => {
  const { cancellationReason } = req.body;
  
  if (!cancellationReason || cancellationReason.trim().length === 0) {
    throw new AppError("Cancellation reason is required", 400);
  }

  const appointment = await Appointment.findByIdAndUpdate(
    req.params.id,
    { 
      status: "CANCELLED",
      reason: cancellationReason.trim() // Store cancellation reason in reason field
    },
    { new: true }
  );

  if (!appointment) {
    throw new AppError("Appointment not found", 404);
  }

  // End conversation if active
  const conversation = await Conversation.findOne({
    appointmentId: String(appointment._id),
    isActive: true,
  });

  if (conversation) {
    conversation.isActive = false;
    conversation.endedAt = new Date();
    await conversation.save();
  }
  
  await createActivity(
    "APPOINTMENT_CANCELLED",
    "Appointment Cancelled",
    `Appointment cancelled for Patient ${appointment.patientId}. Reason: ${cancellationReason}`,
    {
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
      hospitalId: appointment.hospitalId,
      metadata: { appointmentId: String(appointment._id), cancellationReason },
    }
  );
  
  res.json(appointment);
});

// Upload report file for appointment
router.post(
  "/:id/upload-report",
  upload.single("report"),
  async (req: Request, res) => {
    const file = (req as any).file;
    if (!file) {
      throw new AppError("No file uploaded", 400);
    }

    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      // Delete uploaded file if appointment not found
      if (file.path) {
        fs.unlinkSync(file.path);
      }
      throw new AppError("Appointment not found", 404);
    }

    // Delete old file if exists
    if (appointment.reportFile && fs.existsSync(appointment.reportFile)) {
      try {
        fs.unlinkSync(appointment.reportFile);
      } catch (error) {
        console.error("Failed to delete old report file:", error);
      }
    }

    // Update appointment with file info
    appointment.reportFile = file.path;
    appointment.reportFileName = file.originalname;
    await appointment.save();

    await createActivity(
      "APPOINTMENT_REPORT_UPLOADED",
      "Report Uploaded",
      `Patient uploaded report for appointment ${String(appointment._id)}`,
      {
        patientId: appointment.patientId,
        doctorId: appointment.doctorId,
        hospitalId: appointment.hospitalId,
        metadata: { appointmentId: String(appointment._id), fileName: file.originalname },
      }
    );

    // Notify doctor
    socketEvents.emitToUser(appointment.doctorId, "appointment:reportUploaded", {
      appointmentId: String(appointment._id),
      patientId: appointment.patientId,
      fileName: file.originalname,
    });

    res.json({
      message: "Report uploaded successfully",
      fileUrl: file.path,
      fileName: file.originalname,
    });
  }
);

// Get report file for appointment (must be before /:id route)
router.get("/:id/report", async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      throw new AppError("Appointment not found", 404);
    }

    if (!appointment.reportFile) {
      throw new AppError("No report file found for this appointment", 404);
    }

    // Resolve file path
    let filePath: string;
    if (path.isAbsolute(appointment.reportFile)) {
      filePath = appointment.reportFile;
    } else {
      if (appointment.reportFile.startsWith("/uploads/") || appointment.reportFile.startsWith("uploads/")) {
        filePath = path.join(process.cwd(), appointment.reportFile.replace(/^\//, ""));
      } else {
        filePath = path.join(process.cwd(), "uploads/reports", path.basename(appointment.reportFile));
        // Also try the old path format
        if (!fs.existsSync(filePath)) {
          filePath = path.join(__dirname, "../../", appointment.reportFile);
        }
      }
    }

    if (!fs.existsSync(filePath)) {
      throw new AppError("Report file not found on server", 404);
    }

    res.sendFile(path.resolve(filePath));
  } catch (error: any) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError("Failed to fetch report file: " + error.message, 500);
  }
});

// Delete appointment (Patient can delete their own, Doctor/Admin can delete any)
router.delete("/:id", async (req, res) => {
  try {
    const appointmentId = req.params.id;
    console.log(`[DELETE] Attempting to delete appointment with ID: ${appointmentId}`);
    
    // Validate MongoDB ObjectId format (more lenient - just check if it exists)
    if (!appointmentId || appointmentId.trim().length === 0) {
      return res.status(400).json({ 
        message: "Invalid appointment ID format", 
        error: "Appointment ID is required" 
      });
    }

    // Find the appointment
    const appointment = await Appointment.findById(appointmentId);
    
    if (!appointment) {
      console.log(`[DELETE] Appointment not found: ${appointmentId}`);
      return res.status(404).json({ 
        message: "Appointment not found",
        error: "Not found",
        appointmentId: appointmentId
      });
    }

    console.log(`[DELETE] Found appointment: ${String(appointment._id)}, Status: ${appointment.status}`);

    // Only allow deletion if appointment is PENDING or CANCELLED
    if (appointment.status !== "PENDING" && appointment.status !== "CANCELLED") {
      return res.status(400).json({ 
        message: `Cannot delete appointment. Only PENDING or CANCELLED appointments can be deleted. Current status: ${appointment.status}`,
        error: "Invalid appointment status for deletion",
        currentStatus: appointment.status
      });
    }

    // Store IDs for cleanup and notifications
    const { patientId, doctorId, hospitalId, reportFile } = appointment;
    const appointmentIdStr = String(appointment._id);
    const appointmentObjectId = appointment._id as mongoose.Types.ObjectId;

    console.log(`[DELETE] Starting deletion process for appointment: ${appointmentIdStr}`);

    // 1. Delete related prescriptions
    let prescriptionsCount = 0;
    try {
      const prescriptions = await Prescription.find({ appointmentId: appointmentIdStr });
      prescriptionsCount = prescriptions.length;
      if (prescriptions.length > 0) {
        const prescriptionDeleteResult = await Prescription.deleteMany({ appointmentId: appointmentIdStr });
        console.log(`[DELETE] Deleted ${prescriptionDeleteResult.deletedCount} prescription(s)`);
      }
    } catch (error: any) {
      console.error("[DELETE] Error deleting prescriptions:", error.message);
      // Continue with appointment deletion even if prescription deletion fails
    }

    // 2. Delete related conversations
    let conversationsCount = 0;
    try {
      const conversations = await Conversation.find({ appointmentId: appointmentIdStr });
      conversationsCount = conversations.length;
      if (conversations.length > 0) {
        const conversationDeleteResult = await Conversation.deleteMany({ appointmentId: appointmentIdStr });
        console.log(`[DELETE] Deleted ${conversationDeleteResult.deletedCount} conversation(s)`);
      }
    } catch (error: any) {
      console.error("[DELETE] Error deleting conversations:", error.message);
      // Continue with appointment deletion even if conversation deletion fails
    }

    // 3. Delete report file if exists
    if (reportFile) {
      try {
        let filePath: string;
        if (path.isAbsolute(reportFile)) {
          filePath = reportFile;
        } else {
          if (reportFile.startsWith("/uploads/") || reportFile.startsWith("uploads/")) {
            filePath = path.join(process.cwd(), reportFile.replace(/^\//, ""));
          } else {
            filePath = path.join(process.cwd(), "uploads/reports", path.basename(reportFile));
            // Also try the old path format
            if (!fs.existsSync(filePath)) {
              filePath = path.join(__dirname, "../../", reportFile);
            }
          }
        }

        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`[DELETE] Deleted report file: ${filePath}`);
        } else {
          console.warn(`[DELETE] Report file not found at path: ${filePath}`);
        }
      } catch (error: any) {
        console.error("[DELETE] Failed to delete report file:", error.message);
        // Continue with deletion even if file deletion fails
      }
    }

    // 4. Delete the appointment from database - Use direct MongoDB collection method
    console.log(`[DELETE] Attempting to delete appointment with ObjectId: ${appointmentObjectId}`);
    console.log(`[DELETE] Appointment ID string: ${appointmentIdStr}`);
    console.log(`[DELETE] Appointment ObjectId: ${appointmentObjectId}`);
    
    let deleteResult: any = null;
    let deleted = false;
    
    // PRIMARY METHOD: Use force delete helper (direct MongoDB native driver)
    try {
      const forceResult = await forceDeleteAppointment(appointmentId);
      console.log(`[DELETE] Force delete result:`, forceResult);
      
      if (forceResult.success && forceResult.deletedCount > 0) {
        deleted = true;
        deleteResult = { deletedCount: forceResult.deletedCount, acknowledged: true };
        console.log(`[DELETE] ✅ Document deleted successfully via force delete (native MongoDB)`);
      } else if (forceResult.deletedCount === 0) {
        console.warn(`[DELETE] ⚠️ Force delete returned deletedCount: 0 - document may not exist or already deleted`);
      } else {
        console.error(`[DELETE] Force delete failed:`, forceResult.error);
      }
    } catch (error: any) {
      console.error(`[DELETE] Force delete exception:`, error.message, error);
      // Continue to fallback methods
    }
    
    // FALLBACK: Use MongoDB native collection.deleteOne (bypasses Mongoose hooks)
    if (!deleted) {
      try {
        // Convert to ObjectId if it's a valid MongoDB ObjectId
        let deleteQuery: any;
        try {
          const objectId = new mongoose.Types.ObjectId(appointmentId);
          deleteQuery = { _id: objectId };
          console.log(`[DELETE] Using ObjectId: ${objectId}`);
        } catch (e) {
          // If ObjectId conversion fails, try with string
          deleteQuery = { _id: appointmentId };
          console.log(`[DELETE] Using string ID: ${appointmentId}`);
        }
        
        // Use collection.deleteOne directly (bypasses Mongoose hooks)
        deleteResult = await Appointment.collection.deleteOne(deleteQuery);
        console.log(`[DELETE] Collection.deleteOne result:`, {
          deletedCount: deleteResult.deletedCount,
          acknowledged: deleteResult.acknowledged
        });
        
        if (deleteResult.deletedCount > 0) {
          deleted = true;
          console.log(`[DELETE] ✅ Document deleted successfully via collection.deleteOne`);
        } else {
          console.warn(`[DELETE] ⚠️ deleteOne returned deletedCount: 0 - document may not exist or query didn't match`);
        }
      } catch (error: any) {
        console.error(`[DELETE] Collection.deleteOne failed:`, error.message, error);
      }
    }
    
    // FALLBACK METHOD 1: Try Mongoose deleteOne
    if (!deleted) {
      try {
        deleteResult = await Appointment.deleteOne({ _id: appointmentObjectId });
        console.log(`[DELETE] Mongoose deleteOne result:`, {
          deletedCount: deleteResult.deletedCount,
          acknowledged: deleteResult.acknowledged
        });
        if (deleteResult.deletedCount > 0) {
          deleted = true;
          console.log(`[DELETE] ✅ Document deleted successfully via Mongoose deleteOne`);
        }
      } catch (error: any) {
        console.error(`[DELETE] Mongoose deleteOne failed:`, error.message);
      }
    }
    
    // FALLBACK METHOD 2: Try with string ID
    if (!deleted) {
      try {
        deleteResult = await Appointment.deleteOne({ _id: appointmentId });
        console.log(`[DELETE] Mongoose deleteOne (string ID) result:`, {
          deletedCount: deleteResult.deletedCount
        });
        if (deleteResult.deletedCount > 0) {
          deleted = true;
        }
      } catch (error: any) {
        console.error(`[DELETE] Mongoose deleteOne (string) failed:`, error.message);
      }
    }
    
    // FALLBACK METHOD 3: Try findByIdAndDelete
    if (!deleted) {
      try {
        const deletedDoc = await Appointment.findByIdAndDelete(appointmentObjectId);
        if (deletedDoc) {
          deleted = true;
          deleteResult = { deletedCount: 1, acknowledged: true };
          console.log(`[DELETE] ✅ Document deleted successfully via findByIdAndDelete`);
        }
      } catch (error: any) {
        console.error(`[DELETE] findByIdAndDelete failed:`, error.message);
      }
    }
    
    // FINAL VERIFICATION: Check if document still exists
    if (deleted && deleteResult && deleteResult.deletedCount > 0) {
      // Wait a moment for database to sync
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify deletion by querying the database
      const verifyDelete = await Appointment.findById(appointmentObjectId);
      if (verifyDelete) {
        console.error(`[DELETE] ⚠️ CRITICAL: Document still exists after deletion! Attempting force delete...`);
        
        // Force delete using collection with multiple attempts
        try {
          const objectId = new mongoose.Types.ObjectId(appointmentId);
          const forceResult = await Appointment.collection.deleteOne({ _id: objectId });
          console.log(`[DELETE] Force delete result:`, forceResult);
          
          // Wait and verify again
          await new Promise(resolve => setTimeout(resolve, 200));
          const verifyAgain = await Appointment.findById(appointmentObjectId);
          
          if (verifyAgain) {
            console.error(`[DELETE] ❌ FAILED: Document still exists after force delete!`);
            return res.status(500).json({ 
              message: "Appointment deletion failed - document still exists in database",
              error: "Deletion verification failed",
              appointmentId: appointmentIdStr,
              details: "Document was not removed from database despite successful delete operation"
            });
          } else {
            console.log(`[DELETE] ✅ Force delete successful - document removed`);
            deleted = true;
            deleteResult = { deletedCount: 1, acknowledged: true };
          }
        } catch (error: any) {
          console.error(`[DELETE] Force delete failed:`, error.message);
          return res.status(500).json({ 
            message: "Appointment deletion verification failed: " + error.message,
            error: "Verification error",
            appointmentId: appointmentIdStr
          });
        }
      } else {
        console.log(`[DELETE] ✅ Verification passed - appointment is completely deleted from database`);
      }
    } else {
      // Check if document actually exists
      const checkExists = await Appointment.findById(appointmentObjectId);
      if (!checkExists) {
        // Document doesn't exist, so deletion is successful
        console.log(`[DELETE] ✅ Document does not exist - considered deleted`);
        deleted = true;
        if (!deleteResult) {
          deleteResult = { deletedCount: 1, acknowledged: true };
        }
      } else {
        console.error(`[DELETE] ❌ ALL METHODS FAILED: Could not delete appointment ${appointmentIdStr}`);
        console.error(`[DELETE] Document still exists in database`);
        return res.status(500).json({ 
          message: "Failed to delete appointment from database after trying all methods",
          error: "Deletion failed",
          appointmentId: appointmentIdStr,
          details: "All deletion methods returned deletedCount: 0"
        });
      }
    }

    // 5. Create activity log
    try {
      await createActivity(
        "APPOINTMENT_DELETED",
        "Appointment Deleted",
        `Appointment ${appointmentIdStr} was permanently deleted`,
        {
          patientId,
          doctorId,
          hospitalId,
          metadata: { appointmentId: appointmentIdStr },
        }
      );
    } catch (error) {
      console.error("Error creating activity log:", error);
      // Continue even if activity log fails
    }

    // 6. Emit Socket.IO events
    try {
      socketEvents.emitToUser(patientId, "appointment:deleted", {
        appointmentId: appointmentIdStr,
      });
      socketEvents.emitToUser(doctorId, "appointment:deleted", {
        appointmentId: appointmentIdStr,
      });
      socketEvents.emitToAdmin("appointment:deleted", {
        appointmentId: appointmentIdStr,
        patientId,
        doctorId,
      });
    } catch (error) {
      console.error("Error emitting socket events:", error);
      // Continue even if socket events fail
    }

    // Verify all related data is deleted
    const remainingPrescriptions = await Prescription.countDocuments({ appointmentId: appointmentIdStr });
    const remainingConversations = await Conversation.countDocuments({ appointmentId: appointmentIdStr });
    
    if (remainingPrescriptions > 0 || remainingConversations > 0) {
      console.warn(`WARNING: Some related data still exists - Prescriptions: ${remainingPrescriptions}, Conversations: ${remainingConversations}`);
    }

    res.json({ 
      message: "Appointment deleted successfully from database",
      appointmentId: appointmentIdStr,
      deletedCount: deleteResult?.deletedCount || 1,
      relatedDataDeleted: {
        prescriptions: prescriptionsCount,
        conversations: conversationsCount
      }
    });
  } catch (error: any) {
    console.error("Error deleting appointment:", error);
    const errorMessage = error instanceof AppError 
      ? error.message 
      : error.message || "Failed to delete appointment";
    return res.status(error instanceof AppError ? error.status : 500).json({ 
      message: errorMessage,
      error: "Deletion error",
      details: error.message
    });
  }
});

