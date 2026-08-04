/**
 * Process entrypoint.
 *
 * Separated from `app.ts` so that importing the Express app has no side
 * effects — no database connection, no bound port. `app.ts` builds the app;
 * this file is the only thing that starts it.
 *
 * Render runs this as a long-lived web service and injects `PORT`, which the
 * service must bind for the health check to pass. Binding a different port,
 * or only binding 127.0.0.1, makes Render mark the deploy as failed.
 */
import app from "./app";
import { connectDB } from "./config/db";
import { logger } from "./config/pino";

const PORT = Number(process.env.PORT) || 3000;

connectDB().then(
  () => {
    // Bind 0.0.0.0, not the default: Render routes traffic to the container
    // from outside, so a loopback-only bind is unreachable and the deploy
    // fails its health check with no obvious cause in the logs.
    app.listen(PORT, "0.0.0.0", () => {
      logger.info(`Server is running on port ${PORT}`);
    });
  },
  // Fail fast at boot. A server that's up but can't reach its database is
  // worse than one that never started: Render will restart it, and a
  // consistently failing start is far easier to diagnose than an instance
  // serving 503s indefinitely.
  (error) => {
    logger.error({ err: error }, "Failed to connect to MongoDB — exiting");
    process.exit(1);
  },
);
