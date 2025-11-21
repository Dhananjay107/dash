import { Activity, IActivity, ActivityType } from "./activity.model";
import { Server as SocketIOServer } from "socket.io";

let ioInstance: SocketIOServer | null = null;

export function setSocketIO(io: SocketIOServer) {
  ioInstance = io;
}

export function getSocketIO(): SocketIOServer | null {
  return ioInstance;
}

export async function createActivity(
  type: ActivityType,
  title: string,
  description: string,
  metadata?: {
    userId?: string;
    hospitalId?: string;
    pharmacyId?: string;
    distributorId?: string;
    doctorId?: string;
    patientId?: string;
    [key: string]: any;
  }
): Promise<IActivity> {
  const activity = await Activity.create({
    type,
    title,
    description,
    ...metadata,
  });

  // Emit real-time event to all connected clients
  if (ioInstance) {
    ioInstance.emit("activity", {
      id: activity._id,
      type: activity.type,
      title: activity.title,
      description: activity.description,
      createdAt: activity.createdAt,
      ...metadata,
    });

    // Emit specific events as mentioned in README
    if (activity.type.includes("APPOINTMENT")) {
      ioInstance.emit("appointment:update", {
        id: activity._id,
        type: activity.type,
        title: activity.title,
        description: activity.description,
        createdAt: activity.createdAt,
        ...metadata,
      });
    }
    
    if (activity.type.includes("PRESCRIPTION")) {
      ioInstance.emit("prescription:new", {
        id: activity._id,
        type: activity.type,
        title: activity.title,
        description: activity.description,
        createdAt: activity.createdAt,
        ...metadata,
      });
    }
    
    if (activity.type.includes("INVENTORY")) {
      ioInstance.emit("inventory:alert", {
        id: activity._id,
        type: activity.type,
        title: activity.title,
        description: activity.description,
        createdAt: activity.createdAt,
        ...metadata,
      });
    }
    
    if (activity.type.includes("ORDER")) {
      ioInstance.emit("order:update", {
        id: activity._id,
        type: activity.type,
        title: activity.title,
        description: activity.description,
        createdAt: activity.createdAt,
        ...metadata,
      });
    }
  }

  return activity;
}

export async function getRecentActivities(limit: number = 50) {
  return Activity.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

