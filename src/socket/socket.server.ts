import { Server as HTTPServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
}

interface JWTPayload {
  sub: string;
  role: string;
}

let io: SocketIOServer | null = null;

// Helper for logging
const log = (...args: any[]) => {
  console.log(...args);
};

const logWarn = (...args: any[]) => {
  console.warn(...args);
};

// Helper to get room name for user
const getUserRoom = (userId: string): string => `user:${userId}`;

// Helper to get room name for role
const getRoleRoom = (role: string): string => `role:${role}`;

export function initializeSocket(server: HTTPServer): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || "*", // In production, specify exact origins
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  // Authentication middleware
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token || 
                  socket.handshake.headers.authorization?.replace("Bearer ", "");
    
    if (!token) {
      return next(new Error("Authentication error: No token provided"));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
      socket.userId = decoded.sub;
      socket.userRole = decoded.role;
      next();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Invalid token";
      logWarn(`Socket authentication failed: ${errorMessage}`);
      next(new Error("Authentication error: Invalid token"));
    }
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    const userId = socket.userId;
    const userRole = socket.userRole;

    log(`Socket connected: User ${userId} (${userRole}) - Socket ID: ${socket.id}`);

    // Join user-specific room
    if (userId) {
      const roomName = getUserRoom(userId);
      socket.join(roomName);
      log(`User ${userId} joined room: ${roomName}`);
    }

    // Join role-specific rooms
    if (userRole) {
      socket.join(getRoleRoom(userRole));
    }

    // Join admin room
    if (userRole === "SUPER_ADMIN" || userRole === "ADMIN") {
      socket.join("admin");
    }

    // Handle disconnection
    socket.on("disconnect", (reason) => {
      log(`Socket disconnected: User ${userId} (${userRole}) - Reason: ${reason}`);
    });

    // Handle custom events
    socket.on("ping", () => {
      socket.emit("pong", { timestamp: Date.now() });
    });

    // Test event to verify connection
    socket.on("test:connection", () => {
      socket.emit("test:response", {
        userId,
        userRole,
        socketId: socket.id,
        rooms: Array.from(socket.rooms),
        timestamp: Date.now(),
      });
    });
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error("Socket.IO not initialized. Call initializeSocket first.");
  }
  return io;
}

// Helper functions to emit events
export const socketEvents = {
  // Emit to specific user
  emitToUser: (userId: string, event: string, data: any): void => {
    if (!io) {
      logWarn(`Socket.IO not initialized, cannot emit ${event} to user ${userId}`);
      return;
    }

    const room = getUserRoom(userId);
    const socketsInRoom = io.sockets.adapter.rooms.get(room);
    const socketCount = socketsInRoom ? socketsInRoom.size : 0;

    log(`Emitting ${event} to room: ${room} (${socketCount} socket(s))`);

    if (socketCount === 0) {
      logWarn(`No sockets found in room ${room}! User might not be connected.`);
    }

    io.to(room).emit(event, data);
  },

  // Emit to all users with specific role
  emitToRole: (role: string, event: string, data: any): void => {
    if (!io) {
      logWarn(`Socket.IO not initialized, cannot emit ${event} to role ${role}`);
      return;
    }
    io.to(getRoleRoom(role)).emit(event, data);
  },

  // Emit to admin
  emitToAdmin: (event: string, data: any): void => {
    if (!io) {
      logWarn(`Socket.IO not initialized, cannot emit ${event} to admin`);
      return;
    }
    io.to("admin").emit(event, data);
  },

  // Emit to all connected clients
  emitToAll: (event: string, data: any): void => {
    if (!io) {
      logWarn(`Socket.IO not initialized, cannot emit ${event} to all`);
      return;
    }
    io.emit(event, data);
  },

  // Emit to multiple users
  emitToUsers: (userIds: string[], event: string, data: any): void => {
    if (!io) {
      logWarn(`Socket.IO not initialized, cannot emit ${event} to users`);
      return;
    }
    userIds.forEach((userId) => {
      io!.to(getUserRoom(userId)).emit(event, data);
    });
  },
};
