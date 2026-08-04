import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";

/**
 * Identifies which build an error came from. Render exposes the deployed
 * commit as RENDER_GIT_COMMIT; locally we ask git directly. Falls back to
 * "development" when neither is available (e.g. a source tarball with no .git),
 * which is fine — a build with no release just reports unversioned events
 * rather than failing.
 *
 * This must stay in step with the backend's equivalent in config/sentry.ts:
 * both sides tag events with the same 7-character commit prefix, which is what
 * lets one release in Sentry span the whole deploy.
 */
function resolveRelease(): string {
  if (process.env.RENDER_GIT_COMMIT) {
    return process.env.RENDER_GIT_COMMIT.slice(0, 7);
  }
  try {
    return execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "development";
  }
}

const release = resolveRelease();

// Source-map upload needs credentials that only exist in CI/deploy contexts.
// Without them the plugin is left out entirely, so `npm run build` still works
// on a fresh clone with no Sentry setup — the same optional-by-default pattern
// used by src/libs/sentry.ts and the backend's config/sentry.ts.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;
const uploadSourcemaps = Boolean(sentryAuthToken && sentryOrg && sentryProject);

// https://vite.dev/config/
export default defineConfig({
  base: "/",
  plugins: [
    react(),
    tailwindcss(),
    ...(uploadSourcemaps
      ? [
          sentryVitePlugin({
            authToken: sentryAuthToken,
            org: sentryOrg,
            project: sentryProject,
            release: { name: release },
            // A failed upload must not fail the deploy. An expired token or a
            // Sentry outage should cost us readable stack traces for that
            // build, not the ability to ship it at all.
            errorHandler: (err) => {
              console.warn(
                "[sentry-vite-plugin] source-map upload failed; continuing build:",
                err.message,
              );
            },
            sourcemaps: {
              // Upload the maps to Sentry, then delete them from dist/ so they
              // are never served publicly. Without this, shipping source maps
              // would expose the app's full original source to anyone who
              // opens devtools.
              filesToDeleteAfterUpload: ["./dist/**/*.map"],
            },
          }),
        ]
      : []),
  ],
  build: {
    // Required for Sentry to map minified production stack traces back to real
    // source. Safe to leave on unconditionally: when the Sentry plugin runs it
    // deletes the maps after upload, and when it doesn't run the maps simply
    // aren't generated for upload anywhere.
    sourcemap: uploadSourcemaps,
  },
  define: {
    // Surfaced to src/libs/sentry.ts so runtime events carry the same release
    // name the source maps were uploaded under — without a match, uploaded
    // maps never get applied and traces stay minified.
    "import.meta.env.VITE_SENTRY_RELEASE": JSON.stringify(release),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
