/**
 * The end-to-end backend: an ephemeral MongoDB, the REAL Express app, and the
 * test control plane, in one process that Playwright starts and stops.
 *
 * `import "./env"` must stay first — see the comment at the top of that file.
 * Everything after it is deliberate ordering too: the network stubs are
 * installed before any application module is loaded, and the database is
 * seeded before the app starts accepting requests, so no test can ever observe
 * a half-built world.
 *
 * The frontend is NOT started here. It runs as its own Playwright `webServer`
 * using the frontend package's real `npm start`, so the suite exercises the
 * same Express server (per-shop <head> injection, /sitemap.xml, CSP headers)
 * that Render runs in production rather than a Vite dev server.
 */
import "./env";

import { MongoMemoryReplSet } from "mongodb-memory-server";
import { setupEnv } from "./env";
import { BACKEND_PORT, CONTROL_PORT, SMTP_PORT } from "./config";
import { installExternalStubs } from "./stub-external";
import { createSmtpSink } from "./smtp-sink";

async function main(): Promise<void> {
  // A replica set, not a standalone: `createOrderHandler` wraps the order and
  // its order-number counter in `session.withTransaction`, and MongoDB refuses
  // transactions outside a replica set. A single-node set is enough and starts
  // in about the same time as a standalone.
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });

  setupEnv(mongo.getUri());
  installExternalStubs();

  // Must be listening before anything can sign up — the very first thing
  // `seedAll()` does is register the owner, which sends a verification email.
  const smtp = createSmtpSink();
  await new Promise<void>((resolve) =>
    smtp.listen(SMTP_PORT, "127.0.0.1", resolve),
  );

  // Imported only now, so every module below sees the environment above. In
  // particular `middlewares/auth.ts` reads JWT_SECRET at module load and
  // `config/env-validation.ts` throws at import time when it is missing.
  // Quiet by default. The backend logs one full pino record per HTTP request,
  // and the SPA makes several per page — piped into Playwright's reporter that
  // is thousands of lines per run, which buries the test results and any real
  // error along with them. Raise it with E2E_LOG_LEVEL=info when debugging.
  const { logger } = await import("../../backend/config/pino");
  logger.level = process.env.E2E_LOG_LEVEL ?? "warn";

  const { connect, seedAll } = await import("./seed");
  const { createControlServer } = await import("./control");
  const app = (await import("../../backend/app")).default;

  await connect();
  await seedAll();

  const control = createControlServer();
  await new Promise<void>((resolve) =>
    control.listen(CONTROL_PORT, "127.0.0.1", resolve),
  );

  const server = app.listen(BACKEND_PORT, "127.0.0.1", () => {
    console.log(`[e2e] backend on http://localhost:${BACKEND_PORT}`);
    console.log(`[e2e] control on http://localhost:${CONTROL_PORT}`);
  });

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    server.close();
    control.close();
    smtp.close();
    // Without this the mongod child survives on Windows, holding its port and
    // its data directory, and the next run fails in a way that looks nothing
    // like the actual cause.
    await mongo.stop().catch(() => undefined);
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
  process.on("SIGHUP", () => void shutdown());
}

main().catch((error) => {
  console.error("[e2e] harness failed to start:", error);
  process.exit(1);
});
