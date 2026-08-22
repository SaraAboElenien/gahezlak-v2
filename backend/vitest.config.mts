import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // `npm run build` emits to dist/. Without this, vitest discovers the
    // compiled copy of every test alongside the source and runs each twice —
    // and the CommonJS build of a test cannot import vitest at all, so the
    // duplicates fail as suite-level errors that look unrelated to the build.
    exclude: ["**/node_modules/**", "dist/**"],
    env: {
      /**
       * Where mongodb-memory-server keeps its mongod binary.
       *
       * `.github/workflows/ci.yml` already sets exactly this path for the
       * backend job and caches it, and `playwright.config.ts` sets it for the
       * E2E harness — but nothing set it for a *local* backend run, which left
       * local runs pointing at the package default (`~/.cache/mongodb-binaries`)
       * instead. The consequence is not a slower first run, which would be
       * fine: a killed or timed-out run leaves a `.lock` and a partial
       * `…zip.downloading` behind, and the next run then blocks waiting on a
       * download that no live process is performing. It presents as
       * `beforeAll` hanging until the hook timeout with no error message and
       * no mention of downloading — the binary is plainly on disk, just not in
       * the directory being consulted.
       *
       * Setting it here makes local, CI and E2E share one cached binary, so
       * there is one copy to warm and one place to look when it misbehaves.
       */
      MONGOMS_DOWNLOAD_DIR: path.resolve(
        import.meta.dirname,
        "../.cache/mongodb-binaries",
      ),
    },
    testTimeout: 30000, // mongodb-memory-server's first binary download/boot can be slow
    hookTimeout: 30000,
  },
});
