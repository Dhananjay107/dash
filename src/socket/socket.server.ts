import { Server as HTTPServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
}

let io: SocketIOServer | null = null;

export function initializeSocket(server: HTTPServer) {
  io = new SocketIOServer(server, {
    cors: {
      origin: "*", // In production, specify exact origins
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  // Authentication middleware
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace("Bearer ", "");
    
    if (!token) {
      return next(new Error("Authentication error: No token provided"));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { sub: string; role: string };
      socket.userId = decoded.sub;
      socket.userRole = decoded.role;
      next();
    } catch (err) {
      next(new Error("Authentication error: Invalid token"));
    }
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    const userId = socket.userId;
    const userRole = socket.userRole;

    console.log(`Socket connected: User ${userId} (${userRole})`);
    console.log(`Socket ID: ${socket.id}`);

    // Join user-specific room
    if (userId) {
      const roomName = `user:${userId}`;
      socket.join(roomName);
      console.log(`✅ User ${userId} joined room: ${roomName}`);
      
      // Verify room membership
      setTimeout(() => {
        const rooms = Array.from(socket.rooms);
        console.log(`📋 User ${userId} is in rooms:`, rooms);
      }, 100);
    }

    // Join role-specific rooms
    if (userRole) {
      socket.join(`role:${userRole}`);
    }

    // Join admin room
    if (userRole === "SUPER_ADMIN" || userRole === "ADMIN") {
      socket.join("admin");
    }

    // Handle disconnection
    socket.on("disconnect", () => {
      console.log(`Socket disconnected: User ${userId} (${userRole})`);
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
  emitToUser: (userId: string, event: string, data: any) => {
    if (io) {
      const room = `user:${userId}`;
      console.log(`📡 Emitting ${event} to room: ${room}`);
      console.log(`📡 Event data:`, JSON.stringify(data, null, 2));
      
      const socketsInRoom = io.sockets.adapter.rooms.get(room);
      const socketCount = socketsInRoom ? socketsInRoom.size : 0;
      console.log(`📡 Sockets in room ${room}: ${socketCount}`);
      
      if (socketCount === 0) {
        console.warn(`⚠️ No sockets found in room ${room}! User might not be connected.`);
        // Try alternative room formats
        const altRoom1 = `user:${userId.toString()}`;
        const altRoom2 = userId.toString();
        console.log(`⚠️ Trying alternative rooms: ${altRoom1}, ${altRoom2}`);
      }
      
      io.to(room).emit(event, data);
      console.log(`✅ Event ${event} emitted to room ${room}`);
    } else {
      console.warn(`⚠️ Socket.IO not initialized, cannot emit ${event} to user ${userId}`);
    }
  },

  // Emit to all users with specific role
  emitToRole: (role: string, event: string, data: any) => {
    if (io) {
      io.to(`role:${role}`).emit(event, data);
    }
  },

  // Emit to admin
  emitToAdmin: (event: string, data: any) => {
    if (io) {
      io.to("admin").emit(event, data);
    }
  },

  // Emit to all connected clients
  emitToAll: (event: string, data: any) => {
    if (io) {
      io.emit(event, data);
    }
  },

  // Emit to multiple users
  emitToUsers: (userIds: string[], event: string, data: any) => {
    if (io) {
      userIds.forEach((userId) => {
        io.to(`user:${userId}`).emit(event, data);
      });
    }
  },
};

