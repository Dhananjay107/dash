import mongoose from "mongoose";
import { withTransaction } from "../../config/mongodb.config";

interface Account {
  model: mongoose.Model<any>;
  id: string;
}

interface InventoryUpdate {
  model: mongoose.Model<any>;
  id: string;
  quantity: number;
}

interface MultiOperation {
  model: mongoose.Model<any>;
  operation: "create" | "update" | "delete";
  filter?: any;
  data?: any;
  options?: any;
}

export class TransactionService {
  static async executeTransaction<T>(
    operations: (session: mongoose.ClientSession) => Promise<T>
  ): Promise<T> {
    return await withTransaction(operations);
  }

  static async financialTransfer(
    fromAccount: Account,
    toAccount: Account,
    amount: number
  ): Promise<void> {
    await withTransaction(async (session) => {
      await fromAccount.model.findByIdAndUpdate(
        fromAccount.id,
        { $inc: { balance: -amount } },
        { session }
      );

      await toAccount.model.findByIdAndUpdate(
        toAccount.id,
        { $inc: { balance: amount } },
        { session }
      );
    });
  }

  static async inventoryOrderTransaction(
    inventoryUpdates: InventoryUpdate[],
    orderData: any,
    orderModel: mongoose.Model<any>
  ): Promise<any> {
    return await withTransaction(async (session) => {
      await Promise.all(
        inventoryUpdates.map((update) =>
          update.model.findByIdAndUpdate(
            update.id,
            { $inc: { quantity: -update.quantity } },
            { session }
          )
        )
      );

      const [order] = await orderModel.create([orderData], { session });
      return order;
    });
  }

  static async appointmentWithConversation(
    appointmentData: any,
    conversationData: any,
    appointmentModel: mongoose.Model<any>,
    conversationModel: mongoose.Model<any>
  ): Promise<{ appointment: any; conversation: any }> {
    return await withTransaction(async (session) => {
      const [appointment] = await appointmentModel.create([appointmentData], { session });

      const [conversation] = await conversationModel.create(
        [{ ...conversationData, appointmentId: appointment._id }],
        { session }
      );

      return { appointment, conversation };
    });
  }

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

  static async multiOperation(operations: MultiOperation[]): Promise<any[]> {
    return await withTransaction(async (session) => {
      const results = await Promise.all(
        operations.map(async (op) => {
          switch (op.operation) {
            case "create": {
              const [created] = await op.model.create([op.data], { session, ...op.options });
              return created;
            }
            case "update":
              return await op.model.findByIdAndUpdate(op.filter, op.data, {
                new: true,
                session,
                ...op.options,
              });
            case "delete":
              return await op.model.findByIdAndDelete(op.filter, { session });
            default:
              throw new Error(`Unknown operation: ${op.operation}`);
          }
        })
      );

      return results;
    });
  }
}
