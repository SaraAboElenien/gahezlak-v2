/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  /** Optional — error reporting no-ops entirely when unset. */
  readonly VITE_SENTRY_DSN?: string;
  /** Injected at build time by vite.config.ts; see src/libs/sentry.ts. */
  readonly VITE_SENTRY_RELEASE?: string;
  /** "true" enables the AI menu UI; see src/config/features.ts. */
  readonly VITE_AI_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
