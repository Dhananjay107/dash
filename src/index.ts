import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import mongoose from "mongoose";
import { createServer } from "http";
import "express-async-errors";

import { registerRoutes } from "./routes";
import { errorHandler } from "./shared/middleware/errorHandler";
import { MONGO_URI, PORT } from "./config";
import { audit } from "./shared/middleware/audit";
import { initializeSocket } from "./socket/socket.server";

const app = express();
const httpServer = createServer(app);

// Disable ETag to prevent 304 responses
app.set('etag', false);

// Disable caching for all API responses
app.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'ETag': false
  });
  next();
});

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

    // Initialize Socket.IO
    initializeSocket(httpServer);
    console.log("Socket.IO server initialized");

    httpServer.listen(PORT, () => {
      console.log(`API Gateway listening on port ${PORT}`);
      console.log(`Socket.IO server running on port ${PORT}`);
      console.log(`Public API available at http://localhost:${PORT}/api/public`);
      console.log(`API Documentation: http://localhost:${PORT}/api/docs`);
    });
  } catch (err) {
    console.error("Failed to start server", err);
    process.exit(1);
  }
}

void start();


