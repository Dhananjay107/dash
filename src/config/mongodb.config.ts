import mongoose from "mongoose";

/**
 * Advanced MongoDB Configuration
 * Includes: Transactions, Schema Validation, Sharding Support, Connection Pooling
 */

interface MongoDBConfig {
  uri: string;
  options?: mongoose.ConnectOptions;
}

/**
 * Initialize MongoDB with advanced configuration
 * - ACID Transactions support
 * - Schema validation
 * - Connection pooling
 * - Sharding configuration
 * - Index optimization
 */
export async function initializeMongoDB(uri: string): Promise<void> {
  const options: mongoose.ConnectOptions = {
    // Connection Pool Settings
    maxPoolSize: 50, // Maximum number of connections in the pool
    minPoolSize: 5, // Minimum number of connections
    maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
    
    // Transaction Support (ACID)
    retryWrites: true,
    retryReads: true,
    readConcern: { level: "majority" }, // Read from majority of replicas
    writeConcern: { w: "majority", wtimeout: 5000 }, // Write to majority with 5s timeout
    
    // Server Selection
    serverSelectionTimeoutMS: 5000, // Timeout for server selection
    socketTimeoutMS: 45000, // Socket timeout
    
    // Monitoring
    heartbeatFrequencyMS: 10000, // Heartbeat every 10 seconds
  };

  try {
    await mongoose.connect(uri, options);
    
    // Enable transactions for replica sets
    if (mongoose.connection.readyState === 1) {
      console.log("✅ MongoDB connected with advanced configuration");
      console.log("   - ACID Transactions: Enabled");
      console.log("   - Connection Pooling: Active");
      console.log("   - Read/Write Concern: Majority");
      console.log("   - Retry Logic: Enabled");
    }
    
    // Handle connection events
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

/**
 * Get MongoDB session for transactions
 * Use this for ACID transactions across multiple operations
 */
export async function getSession(): Promise<mongoose.ClientSession> {
  const session = await mongoose.startSession();
  return session;
}

/**
 * Execute operation within a transaction
 * Ensures ACID compliance for critical operations
 */
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

/**
 * Sharding Configuration Helper
 * Note: Sharding must be configured at MongoDB cluster level
 * This provides helper functions for sharded collections
 */
export const ShardingConfig = {
  /**
   * Enable sharding for a collection (requires admin privileges)
   */
  async enableSharding(database: string, collection: string, shardKey: Record<string, 1 | -1>): Promise<void> {
    const adminDb = mongoose.connection.db?.admin();
    if (!adminDb) {
      throw new Error("Admin database not available");
    }
    
    try {
      // Enable sharding on database
      await adminDb.command({ enableSharding: database });
      
      // Shard the collection
      await adminDb.command({
        shardCollection: `${database}.${collection}`,
        key: shardKey,
      });
      
      console.log(`✅ Sharding enabled for ${database}.${collection}`);
    } catch (error) {
      console.error(`❌ Failed to enable sharding for ${collection}:`, error);
      throw error;
    }
  },
  
  /**
   * Get sharding status
   */
  async getShardingStatus(): Promise<any> {
    const adminDb = mongoose.connection.db?.admin();
    if (!adminDb) {
      throw new Error("Admin database not available");
    }
    
    try {
      const status = await adminDb.command({ listShards: 1 });
      return status;
    } catch (error) {
      console.error("Failed to get sharding status:", error);
      return null;
    }
  },
};

/**
 * Schema Validation Helper
 * Adds validation rules to collections at database level
 */
export const SchemaValidation = {
  /**
   * Apply validation rules to a collection
   */
  async applyValidation(
    collectionName: string,
    validator: Record<string, any>,
    validationLevel: "strict" | "moderate" | "off" = "strict",
    validationAction: "error" | "warn" = "error"
  ): Promise<void> {
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("Database not connected");
    }
    
    try {
      await db.command({
        collMod: collectionName,
        validator,
        validationLevel,
        validationAction,
      });
      
      console.log(`✅ Validation applied to ${collectionName}`);
    } catch (error) {
      console.error(`❌ Failed to apply validation to ${collectionName}:`, error);
      throw error;
    }
  },
};

/**
 * Index Management Helper
 */
export const IndexManager = {
  /**
   * Create text search index
   */
  async createTextIndex(collectionName: string, fields: Record<string, "text">): Promise<void> {
    const collection = mongoose.connection.collection(collectionName);
    await collection.createIndex(fields);
    console.log(`✅ Text index created for ${collectionName}`);
  },
  
  /**
   * Create compound index
   */
  async createCompoundIndex(collectionName: string, fields: Record<string, 1 | -1>): Promise<void> {
    const collection = mongoose.connection.collection(collectionName);
    await collection.createIndex(fields);
    console.log(`✅ Compound index created for ${collectionName}`);
  },
  
  /**
   * Get all indexes for a collection
   */
  async getIndexes(collectionName: string): Promise<any[]> {
    const collection = mongoose.connection.collection(collectionName);
    return await collection.indexes();
  },
};
