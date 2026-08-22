import { describe, it, expect, vi } from "vitest";
import { createApiWarmer, healthUrlFor } from "./warm-api";

/**
 * The warmer exists to overlap two Render cold starts instead of serialising
 * them, but it sits in the boot path of the process that serves every page —
 * so the properties that matter most here are the negative ones: it must never
 * throw, never reject, never fire more often than its throttle allows, and be
 * a complete no-op when it has nothing sensible to call.
 */

const API_BASE = "https://api.example.test/api/v1";

function okResponse(status = 200) {
  return { status, ok: status < 400 } as Response;
}

describe("healthUrlFor", () => {
  it("targets the API root, not the versioned prefix", () => {
    // /health is mounted at the root on the backend; appending it to apiBase
    // would produce /api/v1/health, which 404s.
    expect(healthUrlFor(API_BASE)).toBe("https://api.example.test/health");
  });

  it("returns null for a relative or malformed base", () => {
    // src/config/api.ts falls back to a relative "/api/v1" when VITE_API_URL
    // is unset. There is no origin to warm in that case.
    expect(healthUrlFor("/api/v1")).toBeNull();
    expect(healthUrlFor("")).toBeNull();
  });
});

describe("createApiWarmer", () => {
  it("calls the API health endpoint once", async () => {
    const fetchImpl = vi.fn(async () => okResponse());
    const warmer = createApiWarmer({
      apiBase: API_BASE,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      log: () => {},
    });

    await warmer.warm("boot");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.example.test/health",
      expect.anything(),
    );
  });

  it("logs the outcome so a deploy log can prove it fired", async () => {
    const log = vi.fn();
    const warmer = createApiWarmer({
      apiBase: API_BASE,
      fetchImpl: (async () => okResponse()) as unknown as typeof fetch,
      log,
    });

    await warmer.warm("boot");

    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain("[warm-api] boot");
    expect(log.mock.calls[0][0]).toContain("200");
  });

  it("throttles repeat warms", async () => {
    const fetchImpl = vi.fn(async () => okResponse());
    let clock = 1_000_000;
    const warmer = createApiWarmer({
      apiBase: API_BASE,
      throttleMs: 60_000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => clock,
      log: () => {},
    });

    await warmer.warm("first");
    clock += 59_000;
    await warmer.warm("too soon");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    clock += 2_000;
    await warmer.warm("window elapsed");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("collapses concurrent warms into a single request", async () => {
    let release: (value: Response) => void = () => {};
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    const warmer = createApiWarmer({
      apiBase: API_BASE,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      log: () => {},
    });

    const a = warmer.warm("a");
    const b = warmer.warm("b");
    release(okResponse());
    await Promise.all([a, b]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("never rejects when the API is unreachable", async () => {
    const warmer = createApiWarmer({
      apiBase: API_BASE,
      fetchImpl: (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch,
      log: () => {},
    });

    // An unhandled rejection here would be a fire-and-forget call taking down
    // the process that serves every page — the exact failure mode that once
    // took the whole API down (see the header of backend/app.ts).
    await expect(warmer.warm("boot")).resolves.toBeUndefined();
  });

  it("never rejects even if logging itself throws", async () => {
    const warmer = createApiWarmer({
      apiBase: API_BASE,
      fetchImpl: (async () => okResponse()) as unknown as typeof fetch,
      log: () => {
        throw new Error("broken logger");
      },
    });

    await expect(warmer.warm("boot")).resolves.toBeUndefined();
  });

  it("does nothing at all when the API base has no origin", async () => {
    const fetchImpl = vi.fn(async () => okResponse());
    const warmer = createApiWarmer({
      apiBase: "/api/v1",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      log: () => {},
    });

    await warmer.warm("boot");

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
