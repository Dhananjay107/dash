/**
 * Index Service
 * Creates all necessary indexes including text search indexes
 * Run this on application startup to ensure all indexes exist
 */

import mongoose from "mongoose";
import { User } from "../../user/user.model";
import { InventoryItem } from "../../inventory/inventory.model";
import { Prescription } from "../../prescription/prescription.model";
import { Appointment } from "../../appointment/appointment.model";
import { Order } from "../../order/order.model";
import { FinanceEntry } from "../../finance/finance.model";
import { Hospital } from "../../master/hospital.model";
import { Pharmacy } from "../../master/pharmacy.model";
import { PatientRecord } from "../../patient/patientRecord.model";

export class IndexService {
  /**
   * Create all indexes for the application
   * This should be called on application startup
   */
  static async createAllIndexes(): Promise<void> {
    console.log("📊 Creating database indexes...");

    try {
      // User indexes
      await User.collection.createIndex({ name: "text", email: "text" });
      await User.collection.createIndex({ role: 1, isActive: 1 });
      await User.collection.createIndex({ hospitalId: 1 });
      await User.collection.createIndex({ pharmacyId: 1 });
      console.log("✅ User indexes created");

      // Inventory indexes
      await InventoryItem.collection.createIndex({
        medicineName: "text",
        batchNumber: "text",
      });
      await InventoryItem.collection.createIndex({ pharmacyId: 1, medicineName: 1 });
      await InventoryItem.collection.createIndex({ quantity: 1, threshold: 1 });
      await InventoryItem.collection.createIndex({ expiryDate: 1 });
      console.log("✅ Inventory indexes created");

      // Prescription indexes
      await Prescription.collection.createIndex({
        "items.medicineName": "text",
        notes: "text",
      });
      await Prescription.collection.createIndex({ patientId: 1, doctorId: 1 });
      await Prescription.collection.createIndex({ createdAt: -1 });
      console.log("✅ Prescription indexes created");

      // Appointment indexes
      await Appointment.collection.createIndex({ patientId: 1, doctorId: 1 });
      await Appointment.collection.createIndex({ scheduledAt: 1 });
      await Appointment.collection.createIndex({ status: 1, scheduledAt: 1 });
      await Appointment.collection.createIndex({ hospitalId: 1 });
      console.log("✅ Appointment indexes created");

      // Order indexes
      await Order.collection.createIndex({ patientId: 1, status: 1 });
      await Order.collection.createIndex({ pharmacyId: 1, status: 1 });
      await Order.collection.createIndex({ createdAt: -1 });
      console.log("✅ Order indexes created");

      // Finance indexes
      await FinanceEntry.collection.createIndex({ type: 1, occurredAt: -1 });
      await FinanceEntry.collection.createIndex({ hospitalId: 1, occurredAt: -1 });
      await FinanceEntry.collection.createIndex({ pharmacyId: 1, occurredAt: -1 });
      await FinanceEntry.collection.createIndex({ occurredAt: -1 });
      console.log("✅ Finance indexes created");

      // Hospital indexes
      await Hospital.collection.createIndex({ name: "text", address: "text" });
      await Hospital.collection.createIndex({ isActive: 1 });
      console.log("✅ Hospital indexes created");

      // Pharmacy indexes
      await Pharmacy.collection.createIndex({ name: "text", address: "text" });
      await Pharmacy.collection.createIndex({ isActive: 1 });
      console.log("✅ Pharmacy indexes created");

      // Patient Record indexes
      // First, handle duplicate patientId records before creating unique index
      console.log("🔍 Checking for duplicate patientId records...");
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

      if (duplicates.length > 0) {
        console.log(`⚠️  Found ${duplicates.length} duplicate patientId(s), merging records...`);
        
        for (const dup of duplicates) {
          try {
            const records = await PatientRecord.find({ patientId: dup._id })
              .sort({ updatedAt: -1, createdAt: -1 })
              .lean();
            
            if (records.length > 1) {
              // Keep the most recent record, merge data from others
              const primaryRecord = records[0];
              const duplicateRecords = records.slice(1);
              
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
                ].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()),
                labReports: [
                  ...(primaryRecord.labReports || []),
                  ...duplicateRecords.flatMap((r: any) => r.labReports || [])
                ].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()),
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

              // Update primary record with merged data
              await PatientRecord.findByIdAndUpdate(primaryRecord._id, mergedRecord);
              
              // Delete duplicate records
              const duplicateIds = duplicateRecords.map((r: any) => r._id);
              await PatientRecord.deleteMany({ _id: { $in: duplicateIds } });
              
              console.log(`✅ Merged ${duplicateRecords.length} duplicate record(s) for patientId: ${dup._id}`);
            }
          } catch (e: any) {
            console.error(`⚠️  Error merging duplicates for patientId ${dup._id}:`, e.message);
          }
        }
        
        // Verify duplicates are fixed
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
        
        if (remainingDuplicates.length > 0) {
          console.error(`❌ Still have ${remainingDuplicates.length} duplicate(s). Please run: npm run fix-duplicates`);
          throw new Error(`Cannot create unique index: ${remainingDuplicates.length} duplicate patientId records still exist`);
        } else {
          console.log("✅ All duplicates merged successfully");
        }
      } else {
        console.log("✅ No duplicate patientId records found");
      }

      // Drop existing non-unique index if it exists
      try {
        const existingIndexes = await PatientRecord.collection.indexes();
        const existingNonUniqueIndex = existingIndexes.find((idx: any) => 
          idx.name === "patientId_1" && !idx.unique
        );
        if (existingNonUniqueIndex) {
          await PatientRecord.collection.dropIndex("patientId_1");
          console.log("⚠️  Dropped existing non-unique patientId index");
        }
      } catch (e) {
        // Index might not exist, continue
      }
      
      // Create unique index with custom name to avoid conflicts
      try {
        await PatientRecord.collection.createIndex(
          { patientId: 1 }, 
          { unique: true, name: "patientId_unique" }
        );
        console.log("✅ Created unique patientId index");
      } catch (e: any) {
        if (e.message?.includes("already exists") || e.code === 85 || e.codeName === "IndexOptionsConflict") {
          console.log("✅ Patient Record unique index already exists");
        } else if (e.code === 11000 || e.codeName === "DuplicateKey") {
          console.error("❌ Still have duplicate patientId values. Please clean up duplicates manually.");
          console.error("   Run this query to find duplicates:");
          console.error('   db.patientrecords.aggregate([{$group: {_id: "$patientId", count: {$sum: 1}, ids: {$push: "$_id"}}}, {$match: {count: {$gt: 1}}}])');
        } else {
          console.error("⚠️  Error creating index:", e.message);
        }
      }
      console.log("✅ Patient Record indexes processed");

      console.log("✅ All indexes created successfully");
    } catch (error: any) {
      // If it's a duplicate key error for patient records, provide helpful message
      if (error.message?.includes("duplicate key") && error.message?.includes("patientId")) {
        console.error("❌ Error creating patientId unique index: Duplicate records exist");
        console.error("   Please run: npm run fix-duplicates");
        console.error("   Or manually clean up duplicate patientId records in MongoDB");
      } else {
        console.error("❌ Error creating indexes:", error.message);
      }
      // Don't throw - indexes might already exist, continue with application startup
    }
  }

  /**
   * Get index statistics
   */
  static async getIndexStats(): Promise<Record<string, any>> {
    const collections = [
      "users",
      "inventoryitems",
      "prescriptions",
      "appointments",
      "orders",
      "financeentries",
      "hospitals",
      "pharmacies",
      "patientrecords",
    ];

    const stats: Record<string, any> = {};

    for (const collectionName of collections) {
      try {
        const collection = mongoose.connection.collection(collectionName);
        const indexes = await collection.indexes();
        stats[collectionName] = {
          count: indexes.length,
          indexes: indexes.map((idx: any) => ({
            name: idx.name,
            keys: idx.key,
          })),
        };
      } catch (error) {
        stats[collectionName] = { error: "Collection not found" };
      }
    }

    return stats;
  }
}

