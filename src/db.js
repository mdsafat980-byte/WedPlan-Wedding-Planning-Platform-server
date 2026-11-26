import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { env } from "./config/env.js";

let memoryServer = null;

/**
 * Connect Mongoose to MongoDB. In development, when MONGODB_URI is missing,
 * an in-memory MongoDB instance is started so the project runs out of the box.
 */
export async function connectDatabase() {
  let uri = env.mongoUri;

  if (!uri) {
    if (env.isProduction) throw new Error("MONGODB_URI is required in production");
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri();
    console.log("[db] MONGODB_URI not set - using in-memory MongoDB for development");
  }

  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { dbName: "wedplan" });
  console.log("[db] connected to MongoDB");
  return mongoose.connection;
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
}

export const getDb = () => {
  if (!mongoose.connection.db) throw new Error("Database is not connected yet");
  return mongoose.connection.db;
};
