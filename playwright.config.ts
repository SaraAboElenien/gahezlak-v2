import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

import {
  API_BASE_URL,
  BACKEND_URL,
  FRONTEND_PORT,
  FRONTEND_URL,
} from "./e2e/harness/config";

/**
 * End-to-end configuration.
 *
 * The suite drives the REAL stack: the Express API against an ephemeral
 * MongoDB, and the built SPA served by the frontend package's own production
 * Express server. Nothing is mocked except third-party HTTP, which is stubbed
 * inside the harness process (see `e2e/harness/stub-external.ts`) so a run
 * needs no credentials, no Atlas, and no network.
 *
 * WORKERS: 1, ON PURPOSE. Both servers and one database are shared by every
 * spec, and each test starts by dropping and re-seeding that database. Running
 * two workers against one database would make every test's fixtures a race.
 * The honest alternative — a database per worker — would mean a backend
 * process per worker too, and the whole suite finishes in about a minute as it
 * is. `fullyParallel` is therefore off rather than "not thought about".
 */
export default defineConfig({
  testDir: "./e2e/specs",
  outputDir: "./e2e/.artifacts/test-results",

  fullyParallel: false,
  workers: 1,

  // A leftover `test.only` should fail the build rather than silently reduce
  // what CI checks.
  forbidOnly: Boolean(process.env.CI),
  // One retry in CI absorbs genuine infrastructure noise (a slow cold mongod)
  // without hiding a real flake: a test that needs two attempts still shows up
  // as "flaky" in the report. Locally, no retries — a failure should fail.
  retries: process.env.CI ? 1 : 0,

  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: process.env.CI
    ? [
        ["list"],
        ["html", { outputFolder: "e2e/.artifacts/report", open: "never" }],
        ["github"],
      ]
    : [
        ["list"],
        ["html", { outputFolder: "e2e/.artifacts/report", open: "never" }],
      ],

  use: {
    baseURL: FRONTEND_URL,
    // Traces only for a retry, screenshots/video only on failure: enough to
    // diagnose a CI-only failure without paying for artifacts nobody opens.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: [
    {
      // Backend + ephemeral MongoDB + the test control plane, in one process.
      command: "npx tsx e2e/harness/serve.ts",
      url: `${BACKEND_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        // Keeps the downloaded mongod outside node_modules so `npm ci` does not
        // discard it, and matches the path the backend job in ci.yml already
        // caches — so both jobs share one cached binary.
        MONGOMS_DOWNLOAD_DIR: path.join(__dirname, ".cache/mongodb-binaries"),
      },
    },
    {
      // The frontend's real production server (`frontend/server/index.ts`),
      // started through its own npm script so the suite covers the per-shop
      // <head> injection and /sitemap.xml, not just the client bundle.
      // `npm run e2e:build` must have produced frontend/dist first.
      command: "npm start",
      cwd: "frontend",
      url: `${FRONTEND_URL}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        PORT: String(FRONTEND_PORT),
        VITE_API_URL: API_BASE_URL,
        SITE_URL: FRONTEND_URL,
        // Explicitly off: the cold-start pre-warmer would otherwise fire
        // background requests at the API on boot, which is noise here.
        WARM_API: "false",
      },
    },
  ],
});
