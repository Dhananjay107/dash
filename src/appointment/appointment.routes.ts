import { Router } from "express";
import { Appointment } from "./appointment.model";
import { createActivity } from "../activity/activity.service";
import { sendAppointmentReminder } from "../notifications/notification.service";
import { validateRequired } from "../shared/middleware/validation";
import { AppError } from "../shared/middleware/errorHandler";
import { User } from "../user/user.model";
import { Conversation } from "../conversation/conversation.model";

export const router = Router();

// Create appointment (Patient app, Admin portal)
router.post(
  "/",
  validateRequired(["hospitalId", "doctorId", "patientId", "scheduledAt"]),
  async (req, res) => {
    const { scheduledAt } = req.body;
    const appointmentDate = new Date(scheduledAt);
    
    if (isNaN(appointmentDate.getTime())) {
      throw new AppError("Invalid scheduledAt date", 400);
    }

    if (appointmentDate < new Date()) {
      throw new AppError("Appointment cannot be scheduled in the past", 400);
    }

    const appointment = await Appointment.create(req.body);
    
    // Emit activity
    await createActivity(
      "APPOINTMENT_CREATED",
      "New Appointment Created",
      `Patient ${appointment.patientId} booked appointment with Doctor ${appointment.doctorId}`,
      {
        patientId: appointment.patientId,
        doctorId: appointment.doctorId,
        hospitalId: appointment.hospitalId,
        metadata: { appointmentId: appointment._id.toString() },
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
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) {
    throw new AppError("Appointment not found", 404);
  }
  res.json(appointment);
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
      appointmentId: appointment._id.toString(),
      isActive: true,
    });

    if (!existingConversation) {
      const conversationType = appointment.channel === "VIDEO" ? "ONLINE" : "OFFLINE";
      await Conversation.create({
        appointmentId: appointment._id.toString(),
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
        `Conversation started for appointment ${appointment._id}`,
        {
          appointmentId: appointment._id.toString(),
          doctorId: appointment.doctorId,
          patientId: appointment.patientId,
          hospitalId: appointment.hospitalId,
          metadata: { conversationType },
        }
      );
    }
  }

  // End conversation when appointment is completed or cancelled
  if (status === "COMPLETED" || status === "CANCELLED") {
    const conversation = await Conversation.findOne({
      appointmentId: appointment._id.toString(),
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
    `Appointment ${appointment._id} status changed to ${status}`,
    {
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
      hospitalId: appointment.hospitalId,
      metadata: { appointmentId: appointment._id.toString(), status },
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
      metadata: { appointmentId: appointment._id.toString(), newTime: scheduledAt },
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
    appointmentId: appointment._id.toString(),
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
      metadata: { appointmentId: appointment._id.toString(), cancellationReason },
    }
  );
  
  res.json(appointment);
});
