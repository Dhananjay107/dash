import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import mongoose from "mongoose";
import "express-async-errors";

import { registerRoutes } from "./routes";
import { errorHandler } from "./shared/middleware/errorHandler";
import { MONGO_URI, PORT } from "./config";
import { audit } from "./shared/middleware/audit";

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));
app.use(audit);

registerRoutes(app);

app.use(errorHandler);

async function start() {
  try {
    // Initialize MongoDB with advanced configuration
    const { initializeMongoDB } = await import("./config/mongodb.config");
    await initializeMongoDB(MONGO_URI);
    console.log("Connected to MongoDB with advanced configuration");

    // Create all indexes including text search indexes
    const { IndexService } = await import("./shared/services/index.service");
    await IndexService.createAllIndexes();

    app.listen(PORT, () => {
      console.log(`API Gateway listening on port ${PORT}`);
      console.log(`Public API available at http://localhost:${PORT}/api/public`);
      console.log(`API Documentation: http://localhost:${PORT}/api/docs`);
    });
  } catch (err) {
    console.error("Failed to start server", err);
    process.exit(1);
  }
}

void start();


