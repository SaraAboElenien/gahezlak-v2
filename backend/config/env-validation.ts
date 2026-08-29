// Fails fast, loudly, and at a single well-known spot (called at the very
// top of app.ts, before any other module does real work) when a required
// env var is missing — instead of e.g. config/db.ts silently falling back to
// a localhost Mongo URI and failing deep inside a confusing generic
// connection error.
//
// Deliberately scoped to just these three. Everything else in this codebase
// (OPENAI_API_KEY, IMGBB_KEY, PAYMOB_*, SENTRY_DSN, BCRYPT_SALT_ROUNDS) is
// optional/lazy-checked-when-actually-used (see config/openai.ts and
// config/sentry.ts) — forcing those at boot would break local dev for
// anyone not using those features yet.
const REQUIRED_ENV_VARS = [
  "MONGODB_URI",
  "JWT_SECRET",
  "FRONTEND_URL",
] as const;

// Not required — but a deployment missing these cannot verify a single new
// account, so it must not be silent either.
//
// This warning carries a load-bearing responsibility. sendEmail() used to
// THROW when these were absent, deliberately, on the reasoning that a
// deployment mistake should be loud rather than silent. That reasoning was
// right; the mechanism was not. Throwing happened *mid-request*, after
// signUp had already written the user row — so the caller got a 500 while a
// half-activated account existed that they could neither verify nor
// re-register. sendEmail now honours its Promise<boolean> signature and never
// throws, and the loudness moved here: once, at boot, where an operator can
// act on it and no user is halfway through anything.
//
// Deliberately a warning rather than a fatal error: local development without
// SMTP credentials must still boot, matching how every other optional
// integration in this codebase degrades (see the note above).
// Each entry is one credential and the names it may arrive under, newest
// first. The lowercase pair are the ORIGINAL names and are still read by
// utils/send-email.ts for exactly one reason: they are what is currently set
// in the live Render dashboard, and a hard rename would have broken production
// email the moment it deployed. Checking only the new names here would print
// "Email is not configured" at every boot while mail worked perfectly — a
// false alarm in the one place an operator is meant to trust.
const EMAIL_ENV_VARS = [
  { credential: "SMTP_USER", names: ["SMTP_USER", "sendEmail"] },
  { credential: "SMTP_PASSWORD", names: ["SMTP_PASSWORD", "emailPassword"] },
] as const;

// Same reasoning as EMAIL_ENV_VARS, for the other integration whose absence
// stays invisible until a customer is already out of pocket.
//
// These two are handed straight to Paymob as `notification_url` and
// `webhook_url` (see utils/paymob.ts). Unset, `undefined` is sent, Paymob
// calls nobody, and payment.webhook.controller.ts never runs — so a real,
// fully paid order sits at `orderStatus: "Pending"` forever with no error
// anywhere: the charge succeeds, the customer is billed, and the shop simply
// never sees the order. That exact failure was live in this project for weeks
// and read as a payments bug rather than a missing env var.
//
// A warning rather than a throw, for the same reason as above: they are
// genuinely optional in local dev (Paymob cannot reach localhost regardless),
// and refusing to boot over them would turn a degraded feature into an outage.
const WEBHOOK_ENV_VARS = [
  "ORDER_WEBHOOK_URL",
  "SUBSCRIPTION_WEBHOOK_URL",
] as const;

export function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        "Set them in your .env file (or the deployment environment) before starting the server.",
    );
  }

  const missingEmail = EMAIL_ENV_VARS.filter((v) =>
    v.names.every((name) => !process.env[name]),
  ).map((v) => v.credential);

  if (missingEmail.length > 0) {
    // console.warn rather than the pino logger: this module runs before
    // anything else is imported (see the note at the bottom of this file), and
    // importing the logger here would give it a side effect to execute first.
    console.warn(
      `[env] Email is not configured (missing: ${missingEmail.join(", ")}). ` +
        "Signup, resend-verification and password-reset will create codes that " +
        "are never delivered. Set them to enable outbound mail.",
    );
  }

  const missingWebhooks = WEBHOOK_ENV_VARS.filter((name) => !process.env[name]);

  if (missingWebhooks.length > 0) {
    console.warn(
      `[env] Paymob webhooks are not configured (missing: ${missingWebhooks.join(", ")}). ` +
        "Payments will still be taken, but nothing will call back to confirm them: " +
        "paid orders stay Pending and subscription lifecycle events are never applied. " +
        "Point them at this API public /api/v1/webhooks/paymob/* routes.",
    );
  }
}

// Run immediately on import rather than relying on the caller to invoke
// validateEnv() as a body statement. Import declarations (including their
// transitive side effects, e.g. middlewares/auth.ts's own JWT_SECRET check)
// are evaluated in source order *before* the importing module's own
// top-level statements run — that's true even under tsx/esbuild's CJS
// transform in dev, not just real ESM. A `validateEnv();` call written
// between two `import` lines in app.ts would therefore run *after* every
// import above it has already fully executed, not "before anything else."
// Making this module self-executing and importing it first (see app.ts)
// is what actually guarantees it runs before any other module's side
// effects, including its own JWT_SECRET check.
validateEnv();
