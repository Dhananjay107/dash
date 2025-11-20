import { Router } from "express";
import { Prescription } from "./prescription.model";
import { createActivity } from "../activity/activity.service";

export const router = Router();

// Create prescription after consultation
router.post("/", async (req, res) => {
  const prescription = await Prescription.create(req.body);
  
  // Emit activity
  await createActivity(
    "PRESCRIPTION_CREATED",
    "New Prescription Created",
    `Doctor ${prescription.doctorId} created prescription for Patient ${prescription.patientId}`,
    {
      patientId: prescription.patientId,
      doctorId: prescription.doctorId,
      pharmacyId: prescription.pharmacyId,
      metadata: { prescriptionId: prescription._id.toString(), itemCount: prescription.items.length },
    }
  );
  
  res.status(201).json(prescription);
});

// Get prescriptions for a patient
router.get("/by-patient/:patientId", async (req, res) => {
  const items = await Prescription.find({ patientId: req.params.patientId })
    .sort({ createdAt: -1 })
    .limit(50);
  res.json(items);
});

// Get prescriptions for a pharmacy to fulfill
router.get("/by-pharmacy/:pharmacyId", async (req, res) => {
  const items = await Prescription.find({ pharmacyId: req.params.pharmacyId })
    .sort({ createdAt: -1 })
    .limit(50);
  res.json(items);
});


