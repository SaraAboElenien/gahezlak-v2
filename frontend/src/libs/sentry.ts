import * as Sentry from "@sentry/react";

// Optional/lazy by design, same as the backend's config/sentry.ts: the app
// must run identically with VITE_SENTRY_DSN unset — this just no-ops when
// it isn't configured, so builds without it still work.
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;

// Injected by vite.config.ts (commit SHA, or "development"). Must match the
// release the source maps were uploaded under, otherwise Sentry has no way to
// associate them and production stack traces stay minified.
const SENTRY_RELEASE = import.meta.env.VITE_SENTRY_RELEASE;

export const sentryEnabled = Boolean(SENTRY_DSN);

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: SENTRY_RELEASE,
    tracesSampleRate: 0.1,
  });
}
