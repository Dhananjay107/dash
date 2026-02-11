/// <reference types="node" />
import "dotenv/config";
import mongoose from "mongoose";
import { PatientRecord } from "../src/patient/patientRecord.model";

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌ MONGO_URI environment variable is required");
  process.exit(1);
}

async function fixDuplicates() {
  try {
    await mongoose.connect(MONGO_URI as string);
    console.log("✅ Connected to MongoDB");

    console.log("🔍 Finding duplicate patientId records...");
    const duplicates = await PatientRecord.collection.aggregate([
      {
        $group: {
          _id: "$patientId",
          count: { $sum: 1 },
          ids: { $push: "$_id" }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ]).toArray();

    if (duplicates.length === 0) {
      console.log("✅ No duplicate patientId records found!");
      await mongoose.disconnect();
      return;
    }

    console.log(`⚠️  Found ${duplicates.length} duplicate patientId(s)`);

    for (const dup of duplicates) {
      console.log(`\n📋 Processing patientId: ${dup._id} (${dup.count} records)`);
      
      const records = await PatientRecord.find({ patientId: dup._id })
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean();
      
      if (records.length > 1) {
      
        const primaryRecord = records[0];
        const duplicateRecords = records.slice(1);
        
        console.log(`   Keeping record: ${primaryRecord._id}`);
        console.log(`   Merging ${duplicateRecords.length} duplicate record(s)`);
        
        // Merge arrays (diagnosis, allergies, etc.)
        const mergedRecord: any = {
          ...primaryRecord,
          diagnosis: [...new Set([
            ...(primaryRecord.diagnosis || []),
            ...duplicateRecords.flatMap((r: any) => r.diagnosis || [])
          ])],
          allergies: [...new Set([
            ...(primaryRecord.allergies || []),
            ...duplicateRecords.flatMap((r: any) => r.allergies || [])
          ])],
          currentMedications: [...new Set([
            ...(primaryRecord.currentMedications || []),
            ...duplicateRecords.flatMap((r: any) => r.currentMedications || [])
          ])],
          pastSurgeries: [...new Set([
            ...(primaryRecord.pastSurgeries || []),
            ...duplicateRecords.flatMap((r: any) => r.pastSurgeries || [])
          ])],
          hospitalizationHistory: [
            ...(primaryRecord.hospitalizationHistory || []),
            ...duplicateRecords.flatMap((r: any) => r.hospitalizationHistory || [])
          ].sort((a: any, b: any) => (new Date(b?.date).getTime() || 0) - (new Date(a?.date).getTime() || 0)),
          labReports: [
            ...(primaryRecord.labReports || []),
            ...duplicateRecords.flatMap((r: any) => r.labReports || [])
          ].sort((a: any, b: any) => (new Date(b?.date).getTime() || 0) - (new Date(a?.date).getTime() || 0)),
        };

        // Merge notes
        const allNotes = [
          primaryRecord.notes,
          ...duplicateRecords.map((r: any) => r.notes).filter(Boolean)
        ].filter(Boolean);
        
        if (allNotes.length > 1) {
          mergedRecord.notes = allNotes.join("\n\n--- Merged from duplicate record ---\n\n");
        } else if (allNotes.length === 1) {
          mergedRecord.notes = allNotes[0];
        }

        // Update primary record with merged data (omit _id and __v)
        const { _id: _omit, __v: _vOmit, ...updatePayload } = mergedRecord;
        await PatientRecord.findByIdAndUpdate(primaryRecord._id, { $set: updatePayload });
        
        // Delete duplicate records
        const duplicateIds = duplicateRecords.map((r: any) => r._id);
        const deleteResult = await PatientRecord.deleteMany({ _id: { $in: duplicateIds } });
        
        console.log(`   ✅ Merged and deleted ${deleteResult.deletedCount} duplicate record(s)`);
      }
    }

    console.log("\n✅ All duplicates fixed!");
    
    // Verify no duplicates remain
    const remainingDuplicates = await PatientRecord.collection.aggregate([
      {
        $group: {
          _id: "$patientId",
          count: { $sum: 1 }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ]).toArray();

    if (remainingDuplicates.length === 0) {
      console.log("✅ Verification passed: No duplicates remaining");
    } else {
      console.log(`⚠️  Warning: ${remainingDuplicates.length} duplicate(s) still exist`);
    }

    await mongoose.disconnect();
    console.log("✅ Disconnected from MongoDB");
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

fixDuplicates();

