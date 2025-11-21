import { Router } from "express";
import { Conversation } from "./conversation.model";
import { requireAuth, requireRole } from "../shared/middleware/auth";
import { validateRequest } from "../shared/middleware/validation";
import { body } from "express-validator";
import { createActivity } from "../activity/activity.service";

export const router = Router();

// Create or get conversation for an appointment
router.post(
  "/",
  requireAuth,
  requireRole(["DOCTOR", "PATIENT"]),
  [
    body("appointmentId").notEmpty().withMessage("Appointment ID is required"),
    body("conversationType").isIn(["ONLINE", "OFFLINE"]).withMessage("Invalid conversation type"),
  ],
  validateRequest,
  async (req, res) => {
    const { appointmentId, conversationType, doctorId, patientId, hospitalId } = req.body;

    // Get appointment to fetch doctor/patient/hospital if not provided
    const { Appointment } = await import("../appointment/appointment.model");
    const appointment = await Appointment.findById(appointmentId);
    
    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    // Use appointment data if not provided
    const finalDoctorId = doctorId || appointment.doctorId;
    const finalPatientId = patientId || appointment.patientId;
    const finalHospitalId = hospitalId || appointment.hospitalId;
    const finalConversationType = conversationType || (appointment.channel === "VIDEO" ? "ONLINE" : "OFFLINE");

    // Check if conversation already exists
    let conversation = await Conversation.findOne({
      appointmentId,
      isActive: true,
    });

    if (!conversation) {
      conversation = await Conversation.create({
        appointmentId,
        doctorId: finalDoctorId,
        patientId: finalPatientId,
        hospitalId: finalHospitalId,
        conversationType: finalConversationType,
        messages: [],
        isActive: true,
        startedAt: new Date(),
      });

      await createActivity(
        "CONVERSATION_STARTED",
        "Consultation Started",
        `Conversation started for appointment ${appointmentId}`,
        {
          appointmentId,
          doctorId: finalDoctorId,
          patientId: finalPatientId,
          hospitalId: finalHospitalId,
          metadata: { conversationId: conversation._id.toString(), conversationType: finalConversationType },
        }
      );
    }

    res.json(conversation);
  }
);

// Add message to conversation
router.post(
  "/:id/messages",
  requireAuth,
  requireRole(["DOCTOR", "PATIENT"]),
  [
    body("content").notEmpty().withMessage("Message content is required"),
    body("messageType").isIn(["TEXT", "AUDIO", "IMAGE", "FILE"]).optional(),
  ],
  validateRequest,
  async (req, res) => {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const message = {
      senderId: req.user!.sub,
      senderRole: req.user!.role as "DOCTOR" | "PATIENT",
      messageType: req.body.messageType || "TEXT",
      content: req.body.content,
      timestamp: new Date(),
      metadata: req.body.metadata || {},
    };

    conversation.messages.push(message);
    await conversation.save();

    res.json(conversation);
  }
);

// Get conversation by appointment ID
router.get("/by-appointment/:appointmentId", requireAuth, async (req, res) => {
  const conversation = await Conversation.findOne({
    appointmentId: req.params.appointmentId,
    isActive: true,
  });
  if (!conversation) {
    return res.status(404).json({ message: "Conversation not found" });
  }
  res.json(conversation);
});

// Get conversation by ID
router.get("/:id", requireAuth, async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) {
    return res.status(404).json({ message: "Conversation not found" });
  }
  res.json(conversation);
});

// Update conversation (add summary, link prescription, end conversation)
router.patch(
  "/:id",
  requireAuth,
  requireRole(["DOCTOR"]),
  async (req, res) => {
    const { summary, prescriptionId, isActive, endedAt } = req.body;
    const updateData: any = {};
    if (summary !== undefined) updateData.summary = summary;
    if (prescriptionId !== undefined) updateData.prescriptionId = prescriptionId;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (endedAt !== undefined) updateData.endedAt = new Date(endedAt);

    const conversation = await Conversation.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
    });

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (isActive === false && !conversation.endedAt) {
      conversation.endedAt = new Date();
      await conversation.save();
    }

    res.json(conversation);
  }
);

// Get all conversations for a doctor or patient
router.get("/", requireAuth, async (req, res) => {
  const { doctorId, patientId, appointmentId } = req.query;
  const filter: any = {};
  if (doctorId) filter.doctorId = doctorId;
  if (patientId) filter.patientId = patientId;
  if (appointmentId) filter.appointmentId = appointmentId;

  const conversations = await Conversation.find(filter)
    .sort({ createdAt: -1 })
    .limit(100);
  res.json(conversations);
});

