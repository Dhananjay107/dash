import { Activity, IActivity, ActivityType } from "./activity.model";

interface ActivityMetadata {
  userId?: string;
  hospitalId?: string;
  pharmacyId?: string;
  distributorId?: string;
  doctorId?: string;
  patientId?: string;
  [key: string]: any;
}

const DEFAULT_ACTIVITY_LIMIT = 50;

export async function createActivity(
  type: ActivityType,
  title: string,
  description: string,
  metadata?: ActivityMetadata
): Promise<IActivity> {
  return await Activity.create({
    type,
    title,
    description,
    ...metadata,
  });
}

export async function getRecentActivities(limit: number = DEFAULT_ACTIVITY_LIMIT): Promise<IActivity[]> {
  return Activity.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean() as Promise<IActivity[]>;
}
