import mongoose from "mongoose";
import { logger } from "./pino";

/**
 * Opens the MongoDB connection.
 *
 * Throws on failure rather than exiting the process. Deciding to exit belongs
 * to the caller, not here: `server.ts` catches this and exits, because failing
 * fast at boot is right for a long-lived service. Keeping `process.exit(1)`
 * out of this helper means anything else that needs a connection (scripts,
 * seeds, tests) can handle failure on its own terms instead of having the
 * process pulled out from under it.
 */
export const connectDB = async (): Promise<void> => {
  const dbURI = process.env.MONGODB_URI || "mongodb://localhost:27017/gahezlak";

  try {
    await mongoose.connect(dbURI);
    logger.info("MongoDB connected successfully");
  } catch (error) {
    logger.error(
      { err: error },
      "MongoDB connection error: " + (error as Error).message,
    );
    throw error;
  }
};
