import { Router } from "express";
import { PatientRecord } from "./patientRecord.model";

export const router = Router();

// Get or create patient record
router.get("/:patientId", async (req, res) => {
  let record = await PatientRecord.findOne({ patientId: req.params.patientId });
  if (!record) {
    record = await PatientRecord.create({ patientId: req.params.patientId });
  }
  res.json(record);
});

// Update patient record (Doctor can update)
router.patch("/:patientId", async (req, res) => {
  const { diagnosis, allergies, currentMedications, pastSurgeries, hospitalizationHistory, labReports, notes, updatedBy } = req.body;

  const update: any = {};
  if (diagnosis !== undefined) update.diagnosis = diagnosis;
  if (allergies !== undefined) update.allergies = allergies;
  if (currentMedications !== undefined) update.currentMedications = currentMedications;
  if (pastSurgeries !== undefined) update.pastSurgeries = pastSurgeries;
  if (hospitalizationHistory !== undefined) update.hospitalizationHistory = hospitalizationHistory;
  if (labReports !== undefined) update.labReports = labReports;
  if (notes !== undefined) update.notes = notes;
  if (updatedBy !== undefined) update.updatedBy = updatedBy;

  const record = await PatientRecord.findOneAndUpdate(
    { patientId: req.params.patientId },
    { $set: update },
    { new: true, upsert: true }
  );
  res.json(record);
});

// Add single diagnosis
router.post("/:patientId/diagnosis", async (req, res) => {
  const { diagnosis } = req.body;
  const record = await PatientRecord.findOneAndUpdate(
    { patientId: req.params.patientId },
    { $addToSet: { diagnosis } },
    { new: true, upsert: true }
  );
  res.json(record);
});

// Add single allergy
router.post("/:patientId/allergies", async (req, res) => {
  const { allergy } = req.body;
  const record = await PatientRecord.findOneAndUpdate(
    { patientId: req.params.patientId },
    { $addToSet: { allergies: allergy } },
    { new: true, upsert: true }
  );
  res.json(record);
});

