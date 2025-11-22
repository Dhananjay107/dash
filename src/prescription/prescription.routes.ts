import { Router } from "express";
import { Prescription } from "./prescription.model";
import { createActivity } from "../activity/activity.service";
import { validateRequired } from "../shared/middleware/validation";
import { AppError } from "../shared/middleware/errorHandler";

export const router = Router();

// Create prescription after consultation
router.post(
  "/",
  validateRequired(["appointmentId", "doctorId", "patientId", "items"]),
  async (req, res) => {
    const { items } = req.body;
    
    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError("Prescription must have at least one item", 400);
    }

    // Validate each item
    for (const item of items) {
      if (!item.medicineName || !item.dosage || !item.frequency || !item.duration) {
        throw new AppError("Each prescription item must have medicineName, dosage, frequency, and duration", 400);
      }
    }

    // Set default report status to PENDING
    const prescriptionData = {
      ...req.body,
      reportStatus: "PENDING",
    };
    
    const prescription = await Prescription.create(prescriptionData);
    
    // Auto-link prescription to conversation from appointment
    const { Conversation } = await import("../conversation/conversation.model");
    const conversation = await Conversation.findOne({
      appointmentId: prescription.appointmentId,
      isActive: true,
    });

    if (conversation) {
      conversation.prescriptionId = prescription._id.toString();
      await conversation.save();
    } else if (req.body.conversationId) {
      // Fallback: if conversationId is explicitly provided
      await Conversation.findByIdAndUpdate(req.body.conversationId, {
        prescriptionId: prescription._id.toString(),
      });
    }
    
    // Create activity - prescription goes to both Patient Portal and Admin Panel
    await createActivity(
      "PRESCRIPTION_CREATED",
      "New Prescription Created",
      `Doctor ${prescription.doctorId} created prescription for Patient ${prescription.patientId}. Available in Patient Portal and Admin Reports.`,
      {
        patientId: prescription.patientId,
        doctorId: prescription.doctorId,
        pharmacyId: prescription.pharmacyId,
        metadata: { 
          prescriptionId: prescription._id.toString(), 
          itemCount: prescription.items.length,
          reportStatus: "PENDING",
        },
      }
    );
    
    res.status(201).json(prescription);
  }
);

// Create prescription from voice input (speech-to-text)
router.post("/voice", validateRequired(["appointmentId", "doctorId", "patientId", "voiceText"]), async (req, res) => {
  const { appointmentId, doctorId, patientId, pharmacyId, voiceText, notes } = req.body;

  // Parse voice text to extract prescription items
  // This is a simplified parser - in production, use NLP/AI service
  const items = parseVoicePrescription(voiceText);

  if (items.length === 0) {
    throw new AppError("Could not parse prescription items from voice text", 400);
  }

  const prescription = await Prescription.create({
    appointmentId,
    doctorId,
    patientId,
    pharmacyId,
    items,
    notes: notes || "Generated from voice input",
  });

  await createActivity(
    "PRESCRIPTION_CREATED",
    "Voice Prescription Created",
    `Doctor ${doctorId} created prescription via voice for Patient ${patientId}`,
    {
      patientId,
      doctorId,
      pharmacyId,
      metadata: { prescriptionId: prescription._id.toString(), itemCount: items.length, source: "voice" },
    }
  );

  res.status(201).json(prescription);
});

// Simple voice prescription parser (enhance with NLP in production)
function parseVoicePrescription(voiceText: string): Array<{
  medicineName: string;
  dosage: string;
  frequency: string;
  duration: string;
}> {
  const items: Array<{ medicineName: string; dosage: string; frequency: string; duration: string }> = [];
  
  // Split by common separators
  const lines = voiceText.split(/[.,;]/).filter(line => line.trim().length > 0);
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 5) continue;

    // Try to extract medicine name (usually first capitalized word)
    const words = trimmed.split(/\s+/);
    const medicineName = words.find(w => /^[A-Z]/.test(w)) || words[0] || "Medicine";
    
    // Extract dosage (look for numbers with units like mg, ml, etc.)
    const dosageMatch = trimmed.match(/(\d+\s*(mg|ml|g|tablet|tab|capsule|cap))/i);
    const dosage = dosageMatch ? dosageMatch[0] : "As directed";
    
    // Extract frequency (look for patterns like "twice daily", "once a day", etc.)
    const frequencyMatch = trimmed.match(/(once|twice|thrice|\d+)\s*(daily|day|week|hour)/i);
    const frequency = frequencyMatch ? frequencyMatch[0] : "As needed";
    
    // Extract duration (look for patterns like "for 7 days", "for 2 weeks", etc.)
    const durationMatch = trimmed.match(/for\s+(\d+\s*(day|week|month|hour)s?)/i);
    const duration = durationMatch ? durationMatch[0] : "As directed";

    items.push({
      medicineName,
      dosage,
      frequency,
      duration,
    });
  }

  return items;
}

// Get all prescriptions (with optional filters)
router.get("/", async (req, res) => {
  const { doctorId, patientId, pharmacyId, appointmentId } = req.query;
  const filter: any = {};
  if (doctorId) filter.doctorId = doctorId;
  if (patientId) filter.patientId = patientId;
  if (pharmacyId) filter.pharmacyId = pharmacyId;
  if (appointmentId) filter.appointmentId = appointmentId;

  const items = await Prescription.find(filter)
    .sort({ createdAt: -1 })
    .limit(100);
  res.json(items);
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

// Get prescription by ID
router.get("/:id", async (req, res) => {
  const prescription = await Prescription.findById(req.params.id);
  if (!prescription) {
    throw new AppError("Prescription not found", 404);
  }
  res.json(prescription);
});

// Update prescription
router.put("/:id", validateRequired(["items"]), async (req, res) => {
  const { items } = req.body;
  
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError("Prescription must have at least one item", 400);
  }

  // Validate each item
  for (const item of items) {
    if (!item.medicineName || !item.dosage || !item.frequency || !item.duration) {
      throw new AppError("Each prescription item must have medicineName, dosage, frequency, and duration", 400);
    }
  }

  const prescription = await Prescription.findByIdAndUpdate(
    req.params.id,
    { items, ...req.body },
    { new: true, runValidators: true }
  );

  if (!prescription) {
    throw new AppError("Prescription not found", 404);
  }

  await createActivity(
    "PRESCRIPTION_UPDATED",
    "Prescription Updated",
    `Prescription ${prescription._id} was updated`,
    {
      patientId: prescription.patientId,
      doctorId: prescription.doctorId,
      pharmacyId: prescription.pharmacyId,
      metadata: { prescriptionId: prescription._id.toString(), itemCount: prescription.items.length },
    }
  );

  res.json(prescription);
});

// Generate prescription document using template
router.get("/:id/document", async (req, res) => {
  const { hospitalId } = req.query;
  const prescription = await Prescription.findById(req.params.id);
  if (!prescription) {
    throw new AppError("Prescription not found", 404);
  }

  // Get related data
  const { User } = await import("../user/user.model");
  const { Hospital } = await import("../master/hospital.model");
  const doctor = await User.findById(prescription.doctorId);
  const patient = await User.findById(prescription.patientId);
  const appointment = await import("../appointment/appointment.model").then((m) =>
    m.Appointment.findById(prescription.appointmentId)
  );
  const hospital = appointment
    ? await Hospital.findById(appointment.hospitalId || hospitalId)
    : hospitalId
      ? await Hospital.findById(hospitalId)
      : null;

  // Get template
  const { Template } = await import("../template/template.model");
  const templateHospitalId = hospital?._id?.toString() || hospitalId;
  const template = await Template.findOne({
    type: "PRESCRIPTION",
    isActive: true,
    isDefault: true,
    $or: templateHospitalId
      ? [{ hospitalId: templateHospitalId }, { hospitalId: null }]
      : [{ hospitalId: null }],
  }).sort({ hospitalId: -1 }); // Prefer hospital-specific over global

  if (!template) {
    return res.status(404).json({ message: "No template found" });
  }

  // Prepare data for template
  const medicinesHtml = prescription.items
    .map(
      (item, idx) => `
    <tr>
      <td style="padding: 8px; border: 1px solid #334155;">${idx + 1}</td>
      <td style="padding: 8px; border: 1px solid #334155;">${item.medicineName}</td>
      <td style="padding: 8px; border: 1px solid #334155;">${item.dosage}</td>
      <td style="padding: 8px; border: 1px solid #334155;">${item.frequency}</td>
      <td style="padding: 8px; border: 1px solid #334155;">${item.duration}</td>
      <td style="padding: 8px; border: 1px solid #334155;">${item.notes || "-"}</td>
    </tr>
  `
    )
    .join("");

  const templateData: Record<string, string> = {
    hospitalName: hospital?.name || "Hospital Name",
    hospitalAddress: hospital?.address || "",
    hospitalPhone: hospital?.phone || "",
    patientName: patient?.name || "Patient Name",
    patientId: prescription.patientId,
    doctorName: doctor?.name || "Doctor Name",
    doctorId: prescription.doctorId,
    appointmentId: prescription.appointmentId,
    prescriptionId: prescription._id.toString(),
    date: new Date(prescription.createdAt || Date.now()).toLocaleDateString(),
    time: new Date(prescription.createdAt || Date.now()).toLocaleTimeString(),
    medicines: `
    <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
      <tr style="background: #1e293b;">
        <th style="padding: 8px; text-align: left; border: 1px solid #334155;">#</th>
        <th style="padding: 8px; text-align: left; border: 1px solid #334155;">Medicine</th>
        <th style="padding: 8px; text-align: left; border: 1px solid #334155;">Dosage</th>
        <th style="padding: 8px; text-align: left; border: 1px solid #334155;">Frequency</th>
        <th style="padding: 8px; text-align: left; border: 1px solid #334155;">Duration</th>
        <th style="padding: 8px; text-align: left; border: 1px solid #334155;">Notes</th>
      </tr>
      ${medicinesHtml}
    </table>
    `,
    notes: prescription.notes || "",
    footerText: template.footerText || "This is a computer-generated prescription.",
  };

  // Render template
  let rendered = template.content;
  
  // Replace template variables
  template.variables.forEach((variable) => {
    const value = templateData[variable.key] || variable.defaultValue || "";
    const regex = new RegExp(`\\{\\{${variable.key}\\}\\}`, "g");
    rendered = rendered.replace(regex, String(value));
  });

  // Replace all common variables
  Object.keys(templateData).forEach((key) => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    rendered = rendered.replace(regex, String(templateData[key]));
  });

  res.json({ rendered, template: template.name, prescriptionId: prescription._id });
});

// Generate formatted report (Admin Panel - Reports Section)
router.post("/:id/generate-report", async (req, res) => {
  const { hospitalId } = req.query;
  const prescription = await Prescription.findById(req.params.id);
  if (!prescription) {
    throw new AppError("Prescription not found", 404);
  }

  // Get related data
  const { User } = await import("../user/user.model");
  const { Hospital } = await import("../master/hospital.model");
  const doctor = await User.findById(prescription.doctorId);
  const patient = await User.findById(prescription.patientId);
  const appointment = await import("../appointment/appointment.model").then((m) =>
    m.Appointment.findById(prescription.appointmentId)
  );
  const hospital = appointment
    ? await Hospital.findById(appointment.hospitalId || hospitalId)
    : hospitalId
      ? await Hospital.findById(hospitalId)
      : null;

  // Get template
  const { Template } = await import("../template/template.model");
  const templateHospitalId = hospital?._id?.toString() || hospitalId;
  const template = await Template.findOne({
    type: "PRESCRIPTION",
    isActive: true,
    isDefault: true,
    $or: templateHospitalId
      ? [{ hospitalId: templateHospitalId }, { hospitalId: null }]
      : [{ hospitalId: null }],
  }).sort({ hospitalId: -1 });

  if (!template) {
    throw new AppError("No template found", 404);
  }

  // Prepare data for template
  const medicinesHtml = prescription.items
    .map(
      (item, idx) => `
    <tr>
      <td style="padding: 8px; border: 1px solid #334155;">${idx + 1}</td>
      <td style="padding: 8px; border: 1px solid #334155;">${item.medicineName}</td>
      <td style="padding: 8px; border: 1px solid #334155;">${item.dosage}</td>
      <td style="padding: 8px; border: 1px solid #334155;">${item.frequency}</td>
      <td style="padding: 8px; border: 1px solid #334155;">${item.duration}</td>
      <td style="padding: 8px; border: 1px solid #334155;">${item.notes || "-"}</td>
    </tr>
  `
    )
    .join("");

  const templateData: Record<string, string> = {
    hospitalName: hospital?.name || "MediConnect Hospital",
    hospitalAddress: hospital?.address || "",
    hospitalPhone: hospital?.phone || "",
    patientName: patient?.name || "Patient Name",
    patientId: prescription.patientId,
    doctorName: doctor?.name || "Doctor Name",
    doctorId: prescription.doctorId,
    appointmentId: prescription.appointmentId,
    prescriptionId: prescription._id.toString(),
    date: new Date(prescription.createdAt || Date.now()).toLocaleDateString(),
    time: new Date(prescription.createdAt || Date.now()).toLocaleTimeString(),
    medicines: `
    <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
      <tr style="background: #1e293b;">
        <th style="padding: 8px; text-align: left; border: 1px solid #334155;">#</th>
        <th style="padding: 8px; text-align: left; border: 1px solid #334155;">Medicine</th>
        <th style="padding: 8px; text-align: left; border: 1px solid #334155;">Dosage</th>
        <th style="padding: 8px; text-align: left; border: 1px solid #334155;">Frequency</th>
        <th style="padding: 8px; text-align: left; border: 1px solid #334155;">Duration</th>
        <th style="padding: 8px; text-align: left; border: 1px solid #334155;">Notes</th>
      </tr>
      ${medicinesHtml}
    </table>
    `,
    notes: prescription.notes || "",
    footerText: template.footerText || "This is a computer-generated prescription.",
  };

  // Render template
  let rendered = template.content;
  
  // Replace template variables
  template.variables.forEach((variable) => {
    const value = templateData[variable.key] || variable.defaultValue || "";
    const regex = new RegExp(`\\{\\{${variable.key}\\}\\}`, "g");
    rendered = rendered.replace(regex, String(value));
  });

  // Replace all common variables
  Object.keys(templateData).forEach((key) => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    rendered = rendered.replace(regex, String(templateData[key]));
  });

  // Update prescription with formatted report
  prescription.formattedReport = rendered;
  prescription.reportStatus = "FORMATTED";
  prescription.formattedAt = new Date();
  await prescription.save();

  await createActivity(
    "PRESCRIPTION_FORMATTED",
    "Prescription Report Generated",
    `Admin generated formatted report for prescription ${prescription._id}`,
    {
      patientId: prescription.patientId,
      doctorId: prescription.doctorId,
      metadata: { prescriptionId: prescription._id.toString() },
    }
  );

  res.json({ 
    rendered, 
    template: template.name, 
    prescriptionId: prescription._id,
    reportStatus: prescription.reportStatus 
  });
});

// Finalize report (Admin Panel - Send to Patient)
router.post("/:id/finalize-report", async (req, res) => {
  const prescription = await Prescription.findById(req.params.id);
  if (!prescription) {
    throw new AppError("Prescription not found", 404);
  }

  if (prescription.reportStatus !== "FORMATTED") {
    throw new AppError("Report must be formatted before finalizing", 400);
  }

  prescription.reportStatus = "FINALIZED";
  prescription.finalizedAt = new Date();
  prescription.finalizedBy = req.body.adminId || req.user?.sub || "admin";
  await prescription.save();

  await createActivity(
    "PRESCRIPTION_FINALIZED",
    "Prescription Report Finalized",
    `Admin finalized report for prescription ${prescription._id}. Now available to patient.`,
    {
      patientId: prescription.patientId,
      doctorId: prescription.doctorId,
      metadata: { prescriptionId: prescription._id.toString() },
    }
  );

  res.json({ 
    prescription, 
    message: "Report finalized and sent to patient portal" 
  });
});

// Get all prescriptions for admin reports section
router.get("/admin/reports", async (req, res) => {
  const { status, page = 1, limit = 50 } = req.query;
  const filter: any = {};
  
  if (status) {
    filter.reportStatus = status;
  }

  const skip = (Number(page) - 1) * Number(limit);
  
  // Get prescriptions with populated user data
  const { User } = await import("../user/user.model");
  const prescriptions = await Prescription.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  // Populate doctor and patient names
  const populatedPrescriptions = await Promise.all(
    prescriptions.map(async (prescription: any) => {
      const doctor = await User.findById(prescription.doctorId);
      const patient = await User.findById(prescription.patientId);
      return {
        ...prescription,
        doctorId: doctor ? { _id: doctor._id, name: doctor.name, email: doctor.email } : prescription.doctorId,
        patientId: patient ? { _id: patient._id, name: patient.name, email: patient.email } : prescription.patientId,
      };
    })
  );

  const total = await Prescription.countDocuments(filter);

  res.json({
    prescriptions: populatedPrescriptions,
    total,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil(total / Number(limit)),
  });
});

// Get finalized reports for patient
router.get("/patient/reports/:patientId", async (req, res) => {
  const prescriptions = await Prescription.find({
    patientId: req.params.patientId,
    reportStatus: "FINALIZED",
  })
    .sort({ finalizedAt: -1 })
    .populate("doctorId", "name email")
    .populate("appointmentId");

  res.json(prescriptions);
});
