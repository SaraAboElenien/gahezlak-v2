// Required by middlewares/auth.ts, which throws at module-load time if
// JWT_SECRET is unset (fail-fast in real boot, but that means every test
// file needs it set before it imports that module — setupFiles run first).
process.env.JWT_SECRET ??= "test-jwt-secret";
process.env.NODE_ENV ??= "test";

// Tests deliberately provoke errors, and config/sentry.ts arms itself purely
// on SENTRY_DSN being present. Vitest doesn't load .env today, so this is
// already unset — but that's incidental, and the day anything adds env-file
// loading to the test run, every expected-failure test would start shipping
// real events into the production Sentry project. Keep it explicitly off.
delete process.env.SENTRY_DSN;
