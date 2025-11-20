import { Router } from "express";
import { Appointment } from "./appointment.model";
import { createActivity } from "../activity/activity.service";

export const router = Router();

// Create appointment (Patient app, Admin portal)
router.post("/", async (req, res) => {
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
  
  res.status(201).json(appointment);
});

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

// Update status (Doctor & Admin)
router.patch("/:id/status", async (req, res) => {
  const { status } = req.body;
  const appointment = await Appointment.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  );
  
  if (appointment && status === "CONFIRMED") {
    await createActivity(
      "APPOINTMENT_CONFIRMED",
      "Appointment Confirmed",
      `Doctor ${appointment.doctorId} confirmed appointment with Patient ${appointment.patientId}`,
      {
        patientId: appointment.patientId,
        doctorId: appointment.doctorId,
        hospitalId: appointment.hospitalId,
        metadata: { appointmentId: appointment._id.toString() },
      }
    );
  }
  
  res.json(appointment);
});

// Reschedule appointment (Doctor & Admin)
router.patch("/:id/reschedule", async (req, res) => {
  const { scheduledAt } = req.body;
  const appointment = await Appointment.findByIdAndUpdate(
    req.params.id,
    { scheduledAt: new Date(scheduledAt) },
    { new: true }
  );
  
  if (appointment) {
    await createActivity(
      "APPOINTMENT_RESCHEDULED",
      "Appointment Rescheduled",
      `Appointment rescheduled to ${new Date(scheduledAt).toLocaleString()}`,
      {
        patientId: appointment.patientId,
        doctorId: appointment.doctorId,
        hospitalId: appointment.hospitalId,
        metadata: { appointmentId: appointment._id.toString(), newTime: scheduledAt },
      }
    );
  }
  
  res.json(appointment);
});

// Cancel appointment (Doctor & Admin)
router.patch("/:id/cancel", async (req, res) => {
  const appointment = await Appointment.findByIdAndUpdate(
    req.params.id,
    { status: "CANCELLED" },
    { new: true }
  );
  
  if (appointment) {
    await createActivity(
      "APPOINTMENT_CANCELLED",
      "Appointment Cancelled",
      `Appointment cancelled for Patient ${appointment.patientId}`,
      {
        patientId: appointment.patientId,
        doctorId: appointment.doctorId,
        hospitalId: appointment.hospitalId,
        metadata: { appointmentId: appointment._id.toString() },
      }
    );
  }
  
  res.json(appointment);
});


