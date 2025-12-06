export const PORT = process.env.PORT || 4000;

// MongoDB connection URI from environment variables
export const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  throw new Error("MONGO_URI is not defined in environment variables. Please check your .env file.");
}

export const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";


