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

export function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        "Set them in your .env file (or the deployment environment) before starting the server.",
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
