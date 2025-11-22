import { Router, Request, Response } from "express";
import { Conversation, IConversation } from "./conversation.model";
import { requireAuth, requireRole } from "../shared/middleware/auth";
import { validateRequest } from "../shared/middleware/validation";
import { body } from "express-validator";
import { createActivity } from "../activity/activity.service";

export const router = Router();

const DEFAULT_MESSAGE_TYPE = "TEXT";
const DEFAULT_LIMIT = 100;

const getConversationId = (conversation: IConversation): string => String(conversation._id);

router.post(
  "/",
  requireAuth,
  requireRole(["DOCTOR", "PATIENT"]),
  [
    body("appointmentId").notEmpty().withMessage("Appointment ID is required"),
    body("conversationType").isIn(["ONLINE", "OFFLINE"]).withMessage("Invalid conversation type"),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { appointmentId, conversationType, doctorId, patientId, hospitalId } = req.body;

      const { Appointment } = await import("../appointment/appointment.model");
      const appointment = await Appointment.findById(appointmentId);
      
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      const finalDoctorId = doctorId || appointment.doctorId;
      const finalPatientId = patientId || appointment.patientId;
      const finalHospitalId = hospitalId || appointment.hospitalId;
      const finalConversationType = conversationType || (appointment.channel === "VIDEO" ? "ONLINE" : "OFFLINE");

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
            metadata: { 
              conversationId: getConversationId(conversation), 
              conversationType: finalConversationType 
            },
          }
        );
      }

      res.json(conversation);
    } catch (error: any) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ message: "Failed to create conversation", error: error.message });
    }
  }
);

router.post(
  "/:id/messages",
  requireAuth,
  requireRole(["DOCTOR", "PATIENT"]),
  [
    body("content").notEmpty().withMessage("Message content is required"),
    body("messageType").isIn(["TEXT", "AUDIO", "IMAGE", "FILE"]).optional(),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const conversation = await Conversation.findById(req.params.id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const message = {
        senderId: req.user!.sub,
        senderRole: req.user!.role as "DOCTOR" | "PATIENT",
        messageType: (req.body.messageType || DEFAULT_MESSAGE_TYPE) as "TEXT" | "AUDIO" | "IMAGE" | "FILE",
        content: req.body.content,
        timestamp: new Date(),
        metadata: req.body.metadata || {},
      };

      conversation.messages.push(message);
      await conversation.save();

      res.json(conversation);
    } catch (error: any) {
      console.error("Error adding message:", error);
      res.status(500).json({ message: "Failed to add message", error: error.message });
    }
  }
);

router.get("/by-appointment/:appointmentId", requireAuth, async (req: Request, res: Response) => {
  try {
    const conversation = await Conversation.findOne({
      appointmentId: req.params.appointmentId,
      isActive: true,
    });
    
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }
    
    res.json(conversation);
  } catch (error: any) {
    console.error("Error fetching conversation:", error);
    res.status(500).json({ message: "Failed to fetch conversation", error: error.message });
  }
});

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }
    res.json(conversation);
  } catch (error: any) {
    console.error("Error fetching conversation:", error);
    res.status(500).json({ message: "Failed to fetch conversation", error: error.message });
  }
});

router.patch(
  "/:id",
  requireAuth,
  requireRole(["DOCTOR"]),
  async (req: Request, res: Response) => {
    try {
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
    } catch (error: any) {
      console.error("Error updating conversation:", error);
      res.status(500).json({ message: "Failed to update conversation", error: error.message });
    }
  }
);

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { doctorId, patientId, appointmentId } = req.query;
    const filter: any = {};
    
    if (doctorId) filter.doctorId = doctorId;
    if (patientId) filter.patientId = patientId;
    if (appointmentId) filter.appointmentId = appointmentId;

    const conversations = await Conversation.find(filter)
      .sort({ createdAt: -1 })
      .limit(DEFAULT_LIMIT);
    
    res.json(conversations);
  } catch (error: any) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({ message: "Failed to fetch conversations", error: error.message });
  }
});
