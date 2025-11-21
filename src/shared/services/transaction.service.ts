import mongoose from "mongoose";
import { getSession, withTransaction } from "../../config/mongodb.config";

/**
 * Transaction Service
 * Provides ACID transaction support for critical operations
 * 
 * Use cases:
 * - Financial transactions (money transfers, payments)
 * - Inventory updates (stock adjustments)
 * - Multi-document operations that must succeed or fail together
 */

export class TransactionService {
  /**
   * Execute multiple operations in a single transaction
   * All operations succeed or all fail (ACID guarantee)
   */
  static async executeTransaction<T>(
    operations: (session: mongoose.ClientSession) => Promise<T>
  ): Promise<T> {
    return await withTransaction(operations);
  }

  /**
   * Financial Transaction: Transfer money between accounts
   * Ensures both debit and credit operations succeed or fail together
   */
  static async financialTransfer(
    fromAccount: { model: mongoose.Model<any>; id: string },
    toAccount: { model: mongoose.Model<any>; id: string },
    amount: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    await withTransaction(async (session) => {
      // Debit from source
      await fromAccount.model.findByIdAndUpdate(
        fromAccount.id,
        { $inc: { balance: -amount } },
        { session }
      );

      // Credit to destination
      await toAccount.model.findByIdAndUpdate(
        toAccount.id,
        { $inc: { balance: amount } },
        { session }
      );
    });
  }

  /**
   * Inventory Transaction: Update stock with order creation
   * Ensures inventory is updated and order is created atomically
   */
  static async inventoryOrderTransaction(
    inventoryUpdates: Array<{
      model: mongoose.Model<any>;
      id: string;
      quantity: number;
    }>,
    orderData: any,
    orderModel: mongoose.Model<any>
  ): Promise<any> {
    return await withTransaction(async (session) => {
      // Update all inventory items
      for (const update of inventoryUpdates) {
        await update.model.findByIdAndUpdate(
          update.id,
          { $inc: { quantity: -update.quantity } },
          { session }
        );
      }

      // Create order
      const order = await orderModel.create([orderData], { session });
      return order[0];
    });
  }

  /**
   * Appointment Transaction: Create appointment with conversation
   * Ensures appointment and conversation are created together
   */
  static async appointmentWithConversation(
    appointmentData: any,
    conversationData: any,
    appointmentModel: mongoose.Model<any>,
    conversationModel: mongoose.Model<any>
  ): Promise<{ appointment: any; conversation: any }> {
    return await withTransaction(async (session) => {
      const [appointment] = await appointmentModel.create([appointmentData], { session });
      
      const conversation = await conversationModel.create(
        [{ ...conversationData, appointmentId: appointment._id }],
        { session }
      );

      return {
        appointment,
        conversation: conversation[0],
      };
    });
  }

  /**
   * Prescription Transaction: Create prescription and update patient record
   */
  static async prescriptionWithPatientRecord(
    prescriptionData: any,
    patientRecordUpdate: any,
    prescriptionModel: mongoose.Model<any>,
    patientRecordModel: mongoose.Model<any>,
    patientId: string
  ): Promise<any> {
    return await withTransaction(async (session) => {
      const [prescription] = await prescriptionModel.create([prescriptionData], { session });

      await patientRecordModel.findOneAndUpdate(
        { patientId },
        { $set: patientRecordUpdate },
        { upsert: true, session }
      );

      return prescription;
    });
  }

  /**
   * Generic multi-operation transaction
   */
  static async multiOperation(
    operations: Array<{
      model: mongoose.Model<any>;
      operation: "create" | "update" | "delete";
      filter?: any;
      data?: any;
      options?: any;
    }>
  ): Promise<any[]> {
    return await withTransaction(async (session) => {
      const results = [];

      for (const op of operations) {
        let result;

        switch (op.operation) {
          case "create":
            const [created] = await op.model.create([op.data], { session, ...op.options });
            result = created;
            break;

          case "update":
            result = await op.model.findByIdAndUpdate(
              op.filter,
              op.data,
              { new: true, session, ...op.options }
            );
            break;

          case "delete":
            result = await op.model.findByIdAndDelete(op.filter, { session });
            break;
        }

        results.push(result);
      }

      return results;
    });
  }
}
