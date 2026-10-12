/**
 * db.js — MongoDB connection helper.
 *
 * Call `connectDB()` once at server startup.
 * Mongoose will reuse the same connection for every query after that.
 */

import mongoose from "mongoose";

/**
 * Opens a connection to MongoDB using the MONGODB_URI from the environment.
 * Throws if the URI is missing so the server fails fast with a clear message.
 */
export const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is not set – add it to server/.env");
  }

  // strictQuery: true means Mongoose will ignore query fields that are not in the schema.
  // This prevents typo-based queries from silently returning wrong results.
  mongoose.set("strictQuery", true);

  await mongoose.connect(uri);
  console.log("✅ MongoDB connected");
};
