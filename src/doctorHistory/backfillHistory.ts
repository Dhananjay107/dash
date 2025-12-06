import mongoose from "mongoose";
import { DoctorPatientHistory } from "./doctorHistory.model";
import { Prescription } from "../prescription/prescription.model";
import { Appointment } from "../appointment/appointment.model";
import { User } from "../user/user.model";

export async function backfillPrescriptionHistory() {
  console.log("🔄 Starting backfill of prescription history...");
  
  try {
    // Get all prescriptions
    const prescriptions = await Prescription.find({}).lean();
    console.log(`📋 Found ${prescriptions.length} prescriptions to process`);
    
    let created = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const prescription of prescriptions) {
      try {
        // Check if history already exists
        const existingHistory = await DoctorPatientHistory.findOne({
          prescriptionId: String(prescription._id),
        });
        
        if (existingHistory) {
          skipped++;
          continue;
        }
        
        // Get patient name
        const patient = await User.findById(prescription.patientId);
        const patientName = patient?.name || `Patient ${prescription.patientId.slice(-8)}`;
        
        // Get appointment if exists
        let appointmentDate: Date | undefined;
        if (prescription.appointmentId) {
          const appointment = await Appointment.findById(prescription.appointmentId);
          if (appointment) {
            appointmentDate = appointment.scheduledAt;
          }
        }
        
        // Create history record
        await DoctorPatientHistory.create({
          doctorId: prescription.doctorId,
          patientId: prescription.patientId,
          patientName,
          historyType: "PRESCRIPTION",
          appointmentId: prescription.appointmentId,
          appointmentDate,
          prescriptionId: String(prescription._id),
          prescriptionItems: prescription.items || [],
          prescriptionNotes: prescription.notes || prescription.suggestions,
          metadata: {
            itemCount: prescription.items?.length || 0,
            reportStatus: prescription.reportStatus || "PENDING",
            backfilled: true,
          },
        });
        
        created++;
        if (created % 10 === 0) {
          console.log(`✅ Processed ${created} prescriptions...`);
        }
      } catch (error: any) {
        console.error(`❌ Error processing prescription ${prescription._id}:`, error.message);
        errors++;
      }
    }
    
    console.log(`✅ Backfill complete!`);
    console.log(`   - Created: ${created} history records`);
    console.log(`   - Skipped: ${skipped} (already exist)`);
    console.log(`   - Errors: ${errors}`);
    
    return { created, skipped, errors };
  } catch (error: any) {
    console.error("❌ Backfill failed:", error);
    throw error;
  }
}

// Run backfill if called directly
if (require.main === module) {
  const { MONGO_URI } = require("../config");
  const { initializeMongoDB } = require("../config/mongodb.config");
  
  (async () => {
    try {
      await initializeMongoDB(MONGO_URI);
      console.log("✅ Connected to MongoDB");
      await backfillPrescriptionHistory();
      process.exit(0);
    } catch (error) {
      console.error("❌ Failed:", error);
      process.exit(1);
    }
  })();
}

