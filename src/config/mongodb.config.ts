import mongoose from "mongoose";

export async function initializeMongoDB(uri: string): Promise<void> {
  const options: mongoose.ConnectOptions = {
    maxPoolSize: 50,
    minPoolSize: 5,
    maxIdleTimeMS: 30000,
    retryWrites: true,
    retryReads: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  };

  try {
    await mongoose.connect(uri, options);
    
    if (mongoose.connection.readyState === 1) {
      console.log("✅ MongoDB connected");
    }
    
    mongoose.connection.on("error", (err) => {
      console.error("❌ MongoDB connection error:", err);
    });
    
    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️ MongoDB disconnected");
    });
    
    mongoose.connection.on("reconnected", () => {
      console.log("✅ MongoDB reconnected");
    });
    
  } catch (error) {
    console.error("❌ Failed to connect to MongoDB:", error);
    throw error;
  }
}

export async function getSession(): Promise<mongoose.ClientSession> {
  return await mongoose.startSession();
}

export async function withTransaction<T>(
  operation: (session: mongoose.ClientSession) => Promise<T>
): Promise<T> {
  const session = await mongoose.startSession();
  
  try {
    let result: T;
    
    await session.withTransaction(async () => {
      result = await operation(session);
    });
    
    return result!;
  } catch (error) {
    console.error("Transaction failed:", error);
    throw error;
  } finally {
    await session.endSession();
  }
}
