import { Activity, IActivity, ActivityType } from "./activity.model";

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

  // Activity is now stored in database and will be fetched via polling
  // No real-time WebSocket events needed

  return activity;
}

export async function getRecentActivities(limit: number = 50) {
  return Activity.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

