import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

/**
 * Regression coverage for import-time side effects in `app.ts`.
 *
 * History: this file was written when the API was deployed to Vercel, where
 * `app.ts` exported nothing (so the serverless builder had no handler to
 * invoke) and called `app.listen()` unconditionally — every production request
 * returned 500, undetected, because nothing in the test suite loaded the module
 * the way the platform did. Writing this test is also what surfaced a third
 * cause: `utils/send-email.ts` throwing at *module load* when email
 * credentials were absent, taking down the entire API on import.
 *
 * The hosting target is now Render, and starting the process is `server.ts`'s
 * job — but the property these tests pin down matters just as much there, and
 * is now the actual architectural contract: importing `app.ts` must not
 * acquire any external resource. No port bound, no database connection, no
 * crash from an unconfigured optional integration. That is what lets tests and
 * supertest import the fully-wired app, and what stops a stray import from a
 * script from starting a server.
 *
 * Not "no side effects at all": `app.ts` does register `uncaughtException` and
 * `unhandledRejection` handlers at module load. That is deliberate — they must
 * be installed before anything else can throw — and it acquires nothing, so it
 * doesn't undermine the contract above. Worth stating precisely rather than
 * repeating an absolute that isn't literally true.
 */

/**
 * This file gets its own timeout, well above the suite's 30s default.
 *
 * `await import("../app")` pulls in the entire route/middleware/model graph in
 * one go — by far the heaviest import in the suite. Run alone it takes ~11s;
 * under a full parallel run it was observed contending badly enough to exceed
 * 30s and fail, then pass on an immediate re-run with nothing changed (logged
 * in KNOWN_ISSUES.md).
 *
 * Raising the ceiling rather than weakening an assertion is the right fix: the
 * assertions were never wrong, the budget was. A false failure here is
 * expensive out of proportion to its size — this is the test guarding a total
 * production outage, so people learning to re-run it until it goes green is
 * exactly how the next outage gets shipped.
 */
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const ORIGINAL_ENV = { ...process.env };

describe("app.ts acquires no external resources at import time", () => {
  beforeAll(() => {
    // config/env-validation.ts throws at import time naming any missing var,
    // so these must exist before app.ts is loaded.
    process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/entrypoint-test";
    process.env.JWT_SECRET = "test-jwt-secret";
    process.env.FRONTEND_URL = "http://localhost:5173";
  });

  afterAll(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it("exports the Express app and binds no port", async () => {
    const listenSpy = vi.spyOn(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("http").Server.prototype,
      "listen",
    );

    const imported = await import("../app");
    const handler = imported.default;

    // An Express app is itself a (req, res) => void function, which is what
    // supertest and any Node host both expect.
    expect(handler).toBeDefined();
    expect(typeof handler).toBe("function");

    // Binding a port belongs to server.ts. If this ever fails, importing the
    // app has started a server as a side effect.
    expect(listenSpy).not.toHaveBeenCalled();
  });

  it("does not open a database connection merely by being imported", async () => {
    const mongoose = (await import("mongoose")).default;

    // connectDB() is called by server.ts, not at import time — so importing
    // the app never blocks on network I/O, and an unreachable database
    // surfaces as a failed boot rather than a module-load crash.
    // readyState 0 = disconnected.
    expect(mongoose.connection.readyState).toBe(0);
  });
});
