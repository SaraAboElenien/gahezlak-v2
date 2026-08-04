import * as Sentry from "@sentry/node";

// Mirrors the lazy/optional pattern already used for OPENAI_API_KEY
// (config/openai.ts): the app must boot and run identically with SENTRY_DSN
// unset, not crash or degrade. A DSN is configured for local dev, but
// deployed environments set it separately — so this stays optional.
const SENTRY_DSN = process.env.SENTRY_DSN;

export const sentryEnabled = Boolean(SENTRY_DSN);

// Identifies which deploy an error came from. Render exposes the deployed
// commit as RENDER_GIT_COMMIT; SENTRY_RELEASE allows overriding it elsewhere.
// Undefined is acceptable — events are then simply unversioned.
const SENTRY_RELEASE =
  process.env.SENTRY_RELEASE ||
  (process.env.RENDER_GIT_COMMIT
    ? process.env.RENDER_GIT_COMMIT.slice(0, 7)
    : undefined);

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    release: SENTRY_RELEASE,
    tracesSampleRate: 0.1,
  });
}

// Only worth reporting to Sentry when it's a genuinely unexpected failure —
// CustomError subclasses (validation, auth, not-found, etc.) are expected
// control flow with their own 4xx status codes, not incidents. Call sites
// decide what counts; this just no-ops safely when Sentry isn't configured.
export function captureException(err: unknown) {
  if (sentryEnabled) Sentry.captureException(err);
}
