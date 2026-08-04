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
    testTimeout: 30000, // mongodb-memory-server's first binary download/boot can be slow
    hookTimeout: 30000,
  },
});
