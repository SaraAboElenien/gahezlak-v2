/**
 * Builds the SPA for the end-to-end run.
 *
 * This exists as a separate step — rather than something Playwright does — for
 * a reason worth stating plainly: `VITE_API_URL` is **inlined into the bundle
 * at build time** (`frontend/src/config/api.ts`), so which backend the browser
 * talks to is decided here, before a single test process starts. A dist/ built
 * for local dev points at `http://localhost:3000` and would quietly test
 * against whatever is running there — including, historically, production.
 *
 * `vite build` runs in production mode, which loads `.env` / `.env.production`
 * and pointedly NOT `.env.development` — so the committed dev API URL cannot
 * leak in. Vite also merges `VITE_`-prefixed variables from the real process
 * environment, which is how the value below reaches the bundle.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(here, "../../frontend");

// Kept in step with e2e/harness/config.ts by hand: this file is plain JS so it
// can run under `node` with no loader, and importing the TS config would need
// one. The assertion in `e2e/specs/_smoke.spec.ts` fails loudly if they drift.
const API_BASE_URL = "http://localhost:3100/api/v1";

const result = spawnSync("npm", ["run", "build"], {
  cwd: frontendDir,
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    VITE_API_URL: API_BASE_URL,
    // The AI features call a paid third-party API. Off means the search box
    // and OCR tab are not rendered at all, which is also what production ships.
    VITE_AI_ENABLED: "false",
    // Nothing under test should ship errors to a real Sentry project.
    VITE_SENTRY_DSN: "",
    SENTRY_AUTH_TOKEN: "",
    SENTRY_ORG: "",
    SENTRY_PROJECT: "",
  },
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

/**
 * Prove the URL really was inlined.
 *
 * Worth the twenty lines: if it silently is not, `src/config/api.ts` falls back
 * to a same-origin `/api/v1`, the frontend server answers those requests with
 * index.html, and the SPA dies inside its error boundary showing "Something
 * went wrong" — every test then fails on a missing heading, which points
 * nowhere near the actual cause. (This is not hypothetical: it happened during
 * development of this suite, when an unrelated `npm run build` in frontend/
 * overwrote dist/ with a bundle built without the variable.)
 */
const assetsDir = path.join(frontendDir, "dist/assets");
const bundles = fs
  .readdirSync(assetsDir)
  .filter((name) => name.endsWith(".js"))
  .map((name) => fs.readFileSync(path.join(assetsDir, name), "utf8"));

if (!bundles.some((code) => code.includes(API_BASE_URL))) {
  console.error(
    `\n[e2e] Built bundle does not contain ${API_BASE_URL}.\n` +
      "      VITE_API_URL was not inlined, so the SPA would call its own origin\n" +
      "      and fail. Check e2e/harness/build-frontend.mjs and frontend/src/config/api.ts.\n",
  );
  process.exit(1);
}
