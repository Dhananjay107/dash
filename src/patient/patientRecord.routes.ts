import { Router, Request, Response } from "express";
import { PatientRecord, IPatientRecord } from "./patientRecord.model";

export const router = Router();

const UPDATE_OPTIONS = { new: true, upsert: true };

const buildUpdateObject = (body: any, fields: string[]): any => {
  const update: any = {};
  fields.forEach((field) => {
    if (body[field] !== undefined) {
      update[field] = body[field];
    }
  });
  return update;
};

router.get("/:patientId", async (req: Request, res: Response) => {
  try {
    let record = await PatientRecord.findOne({ patientId: req.params.patientId });
    if (!record) {
      record = await PatientRecord.create({ patientId: req.params.patientId });
    }
    res.json(record);
  } catch (error: any) {
    console.error("Error fetching patient record:", error);
    res.status(500).json({ message: "Failed to fetch patient record", error: error.message });
  }
});

router.patch("/:patientId", async (req: Request, res: Response) => {
  try {
    const updateFields = [
      "diagnosis",
      "allergies",
      "currentMedications",
      "pastSurgeries",
      "hospitalizationHistory",
      "labReports",
      "notes",
      "updatedBy",
    ];

    const update = buildUpdateObject(req.body, updateFields);

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    const record = await PatientRecord.findOneAndUpdate(
      { patientId: req.params.patientId },
      { $set: update },
      UPDATE_OPTIONS
    );

    res.json(record);
  } catch (error: any) {
    console.error("Error updating patient record:", error);
    res.status(500).json({ message: "Failed to update patient record", error: error.message });
  }
});

router.post("/:patientId/diagnosis", async (req: Request, res: Response) => {
  try {
    const { diagnosis } = req.body;
    
    if (!diagnosis) {
      return res.status(400).json({ message: "Diagnosis is required" });
    }

    const record = await PatientRecord.findOneAndUpdate(
      { patientId: req.params.patientId },
      { $addToSet: { diagnosis } },
      UPDATE_OPTIONS
    );

    res.json(record);
  } catch (error: any) {
    console.error("Error adding diagnosis:", error);
    res.status(500).json({ message: "Failed to add diagnosis", error: error.message });
  }
});

router.post("/:patientId/allergies", async (req: Request, res: Response) => {
  try {
    const { allergy } = req.body;
    
    if (!allergy) {
      return res.status(400).json({ message: "Allergy is required" });
    }

    const record = await PatientRecord.findOneAndUpdate(
      { patientId: req.params.patientId },
      { $addToSet: { allergies: allergy } },
      UPDATE_OPTIONS
    );

    res.json(record);
  } catch (error: any) {
    console.error("Error adding allergy:", error);
    res.status(500).json({ message: "Failed to add allergy", error: error.message });
  }
});
