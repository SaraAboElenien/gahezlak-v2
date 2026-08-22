/**
 * Establishes the environment the backend boots into, and refuses to run
 * against anything that isn't disposable.
 *
 * Imported FIRST by `serve.ts` — before any backend module — for the same
 * reason `backend/app.ts` imports `config/env-validation` first: import
 * declarations are evaluated in source order before the importing module's own
 * top-level statements, so a plain `setupEnv()` call further down the file
 * would run *after* `middlewares/auth.ts` had already read `JWT_SECRET` and
 * thrown.
 *
 * THE GUARD IS THE POINT. This suite drops every collection in its database
 * before each test. If `MONGODB_URI` were ever inherited from a developer's
 * `.env`, or from a CI environment configured for the real deployment, that
 * would silently wipe production. So the harness refuses to start unless the
 * inherited value is absent or unmistakably local, and then overwrites it with
 * its own ephemeral instance regardless.
 */
import { BACKEND_PORT, FRONTEND_URL, SMTP_PORT } from "./config";

const REAL_DATABASE_MARKERS = [
  "mongodb+srv://",
  "mongodb.net",
  "gahezlak-api",
  "onrender.com",
];

function assertNoRealDatabase(): void {
  const inherited = process.env.MONGODB_URI?.trim();
  if (!inherited) return;

  const lower = inherited.toLowerCase();
  const looksRemote = REAL_DATABASE_MARKERS.some((marker) =>
    lower.includes(marker),
  );
  const looksLocal =
    lower.startsWith("mongodb://localhost") ||
    lower.startsWith("mongodb://127.0.0.1");

  if (looksRemote || !looksLocal) {
    throw new Error(
      "[e2e] Refusing to start: MONGODB_URI is set to a value that is not an " +
        "obviously local database, and this suite drops every collection " +
        "before each test.\n" +
        `        MONGODB_URI=${inherited}\n` +
        "        Unset it (the harness starts its own in-memory MongoDB) and re-run.",
    );
  }
}

export function setupEnv(mongoUri: string): void {
  process.env.MONGODB_URI = mongoUri;

  // Required by config/env-validation.ts or the app refuses to boot.
  process.env.JWT_SECRET = "e2e-only-jwt-secret-not-used-anywhere-real";
  // Must match the browser origin exactly: the CORS callback in app.ts rejects
  // anything else with a 405 *before* routing, and it is also what
  // utils/qr-code-generator.ts bakes into a new shop's QR code.
  process.env.FRONTEND_URL = FRONTEND_URL;

  // Not "production": that would make the refresh cookie Secure + SameSite=None,
  // which a browser drops over plain-HTTP localhost — every session would die
  // on the first reload. Not "development" either: that switches pino to
  // pretty-printing through a worker thread, which is pure noise here.
  process.env.NODE_ENV = "test";
  process.env.PORT = String(BACKEND_PORT);

  // bcrypt cost dominates the runtime of every signup and login in the suite.
  // 4 is the minimum bcrypt accepts and is the single biggest lever on how
  // long these tests take; it has no bearing on what they prove.
  process.env.BCRYPT_SALT_ROUNDS = "4";

  // Present so utils/upload-to-imgbb.ts builds a well-formed URL. The request
  // never leaves the process — see stub-external.ts.
  process.env.IMGBB_KEY = "e2e-stub-key";

  // Point mail at the in-process sink (smtp-sink.ts) rather than leaving the
  // credentials unset. utils/send-email.ts builds its transporter from these
  // three, and `getTransporter()` throws when the first two are missing —
  // from OUTSIDE sendEmail's own try/catch, so `sendEmail` rejects instead of
  // resolving `false`. Whether signup survives that then depends on whether
  // its caller keeps a `.catch()` on the call. Accepting the mail sidesteps
  // the question entirely and matches how production behaves.
  //
  // Lower-case names are not a typo: send-email.ts reads `process.env.sendEmail`
  // and `process.env.emailPassword` verbatim.
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(SMTP_PORT);
  process.env.sendEmail = "e2e@sink.invalid";
  process.env.emailPassword = "e2e-sink-password";
  process.env.EMAIL_FROM = "no-reply@sink.invalid";

  // Everything below is an optional integration, and every one of them must
  // stay unconfigured. Explicitly deleted rather than assumed unset so an
  // inherited shell variable cannot arm a real client: Sentry would receive
  // events from deliberately-provoked failures, Anthropic would be billed, and
  // Paymob would try to reach hosts that are blocked anyway.
  for (const name of [
    "SENTRY_DSN",
    "SENTRY_RELEASE",
    "ANTHROPIC_API_KEY",
    "AI_MODEL",
    "AI_ENRICH_MODEL",
    "PAYMOB_API_KEY",
    "PAYMOB_SECRET_KEY",
    "PAYMOB_PUBLIC_KEY",
    "PAYMOB_HMAC_SECRET",
    "PAYMOB_DEFAULT_INTEGRATION_ID",
    "PAYMOB_WALLET_INTEGRATION_ID",
    "PAYMOB_MOTO_INTEGRATION_ID",
    "PAYMOB_VERIFICATION_INTEGRATION_ID",
    "PAYMOB_CASH_INTEGRATION_ID",
    "ORDER_WEBHOOK_URL",
    "SUBSCRIPTION_WEBHOOK_URL",
  ]) {
    delete process.env[name];
  }
}

assertNoRealDatabase();
