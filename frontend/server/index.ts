/**
 * Process entrypoint for the frontend web service (Render).
 *
 * Separated from `app.ts` so the app can be constructed and exercised in tests
 * without binding a port — see `app.test.ts`. This file's only jobs are
 * turning environment variables into config, failing loudly if that config is
 * unusable, and listening.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 4173;

/**
 * Required. There is deliberately no hardcoded production fallback: the
 * previous one silently pointed every environment at one specific deployment,
 * which is exactly how local dev ended up talking to production for weeks
 * (see TECH_DEBT.md). Failing at boot is the lesser evil — and on Render a
 * failed boot is visible in the deploy log, whereas silently reading the wrong
 * backend is not visible anywhere.
 */
const apiBase = (process.env.VITE_API_URL ?? "").trim();
if (!apiBase) {
  console.error(
    "VITE_API_URL is not set. The SPA bundle already baked in its own API " +
      "URL at build time, but /sitemap.xml and the per-shop SEO rewrite both " +
      "call the backend at runtime and cannot work without it.",
  );
  process.exit(1);
}

/**
 * Cold-start pre-warm (see `lib/warm-api.ts`).
 *
 * Defaults to on wherever Render is the host — `RENDER` is one of the env vars
 * Render injects into every service — and off everywhere else, so `npm start`
 * on a laptop never reaches out to a deployed backend. `WARM_API=true|false`
 * overrides in either direction without a code change, which is what makes it
 * switchable from the dashboard if the free-tier arithmetic ever changes.
 */
function envFlag(value: string | undefined, fallback: boolean): boolean {
  const normalised = (value ?? "").trim().toLowerCase();
  if (!normalised) return fallback;
  return normalised === "1" || normalised === "true" || normalised === "yes";
}

const warmApiEnabled = envFlag(
  process.env.WARM_API,
  Boolean(process.env.RENDER),
);

const app = createApp({
  apiBase,
  siteUrl: process.env.SITE_URL?.trim(),
  distDir: path.resolve(__dirname, "../dist"),
  warmApi: { enabled: warmApiEnabled },
});

// Bind 0.0.0.0: Render routes traffic in from outside the container, so a
// loopback-only bind fails the health check with no obvious cause.
app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Frontend server listening on port ${PORT} (API pre-warm ${
      warmApiEnabled ? "enabled" : "disabled"
    })`,
  );
});
