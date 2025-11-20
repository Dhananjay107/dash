export const PORT = process.env.PORT || 4000;

// Default to provided MongoDB Atlas URI if not overridden
export const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://d:123@cluster0.qv3mrd1.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

export const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";


