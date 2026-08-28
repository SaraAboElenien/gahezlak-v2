import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { createApp, type ServerConfig } from "./app";

/**
 * Coverage for the server glue that replaced the Vercel Edge Middleware and
 * the Vercel sitemap Function during the move to Render.
 *
 * The pure logic these routes call is tested directly in `lib/seo.test.ts` and
 * `lib/sitemap.test.ts`. What's tested here is everything that was previously
 * platform-specific and is now ours: which paths get rewritten, that a broken
 * or slow backend degrades to the plain SPA instead of erroring, that assets
 * and index.html get the right caching, and that the security headers ported
 * out of vercel.json are actually sent.
 */

const API_BASE = "https://api.example.test/api/v1";

let distDir: string;
// Mirrors the real dist/index.html, including its root-relative og:image and
// twitter:image defaults — those are the values the absolutisation below has
// to fix, so a fixture without them would test nothing.
const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <title>Gahezlak</title>
    <meta name="description" content="Generic description" />
    <meta property="og:image" content="/Logo.png" />
    <meta name="twitter:image" content="/Logo.png" />
  </head>
  <body><div id="root"></div></body>
</html>`;

beforeAll(() => {
  distDir = fs.mkdtempSync(path.join(os.tmpdir(), "gahezlak-dist-"));
  fs.writeFileSync(path.join(distDir, "index.html"), INDEX_HTML, "utf8");
  fs.mkdirSync(path.join(distDir, "assets"));
  fs.writeFileSync(
    path.join(distDir, "assets", "index-abc123.js"),
    "console.log(1)",
    "utf8",
  );
});

afterAll(() => {
  fs.rmSync(distDir, { recursive: true, force: true });
});

/**
 * Every warning the app emitted during the current test. Captured rather than
 * left on `console.warn` so the suite stays quiet AND so the degraded-SEO
 * path — the one that used to be completely silent — can be asserted on.
 */
let warnings: string[];

beforeEach(() => {
  vi.restoreAllMocks();
  warnings = [];
});

function app(overrides: Partial<ServerConfig> = {}) {
  return createApp({
    apiBase: API_BASE,
    distDir,
    logWarn: (message) => warnings.push(message),
    ...overrides,
  });
}

/** Minimal stand-in for the shape the routes read off a fetch Response. */
function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 404) {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

/**
 * A fetch that never answers and only settles when its own abort signal
 * fires, rejecting with the signal's real reason. That reproduces a sleeping
 * Render service faithfully — including the `TimeoutError` DOMException that
 * `AbortSignal.timeout` aborts with, which is what the classification reads —
 * without waiting a real multi-second timeout: the tests pair it with an
 * injected millisecond-scale budget.
 */
function sleepingFetch() {
  return vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(init.signal?.reason ?? new Error("aborted"));
        });
      }),
  );
}

describe("per-shop <head> rewrite", () => {
  it("injects a shop's real metadata into /shops/:slug", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          data: {
            name: "Test Bistro",
            type: "Restaurant",
            logoUrl: "https://img.example.test/logo.png",
            address: { country: "Egypt", city: "Cairo", street: "1 Main St" },
          },
        }),
      ),
    );

    const res = await request(app()).get("/shops/test-bistro");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain("Test Bistro");
    // The generic title must be gone, not merely supplemented.
    expect(res.text).not.toContain("<title>Gahezlak</title>");
    expect(res.text).toContain('property="og:title"');
    expect(res.text).toContain("application/ld+json");
  });

  it("serves the untouched SPA when the backend 404s the shop", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(null, false)),
    );

    const res = await request(app()).get("/shops/does-not-exist");

    expect(res.status).toBe(200);
    expect(res.text).toContain("<title>Gahezlak</title>");
  });

  it("serves the untouched SPA when the backend is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    const res = await request(app()).get("/shops/test-bistro");

    // The page must still render. Losing the rich preview is acceptable;
    // losing the shop's page because the API blipped is not.
    expect(res.status).toBe(200);
    expect(res.text).toContain("<title>Gahezlak</title>");
  });

  it("does not call the backend at all for non-shop routes", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const res = await request(app()).get("/dashboard/orders");

    expect(res.status).toBe(200);
    expect(res.text).toContain("<title>Gahezlak</title>");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("marks rewritten shop pages cacheable and the plain SPA not", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ data: { name: "Test Bistro" } })),
    );
    const shopRes = await request(app()).get("/shops/test-bistro");
    expect(shopRes.headers["cache-control"]).toContain("s-maxage=300");

    const spaRes = await request(app()).get("/login");
    expect(spaRes.headers["cache-control"]).toBe("no-cache");
  });
});

describe("cold-start SEO misses are diagnosable", () => {
  /**
   * The bug this covers, measured on 2026-08-25: a request to a shop page
   * against a cold stack returned the *generic* <title> while three warm
   * requests straight afterwards returned the shop's own. The API was asleep,
   * the 2.5s abort fired, and the handler fell back to the untouched
   * index.html with a 200 and nothing logged — so the traffic that matters
   * most for this feature (crawlers and link scrapers, which always arrive
   * cold) was being served the generic page invisibly.
   *
   * Millisecond budgets are injected so the timeout cases are fast and
   * deterministic; the classification and logging under test are the same
   * code the 2500/6000ms defaults run.
   */
  const FAST_BUDGET = { shopApiTimeoutMs: 20, shopApiTotalBudgetMs: 60 };

  it("still injects metadata, and says nothing, on the happy path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ data: { name: "Test Bistro" } })),
    );

    const res = await request(app()).get("/shops/test-bistro");

    expect(res.status).toBe(200);
    expect(res.text).toContain("Test Bistro");
    // A warning on a working request would make the log useless as a signal.
    expect(warnings).toEqual([]);
  });

  it("warns, naming the shop and the timeout, when the API never answers", async () => {
    const fetchSpy = sleepingFetch();
    vi.stubGlobal("fetch", fetchSpy);

    const res = await request(app(FAST_BUDGET)).get("/shops/Fauget/menu");

    // The page itself must still be served — losing the preview is acceptable,
    // losing the shop's page is not.
    expect(res.status).toBe(200);
    expect(res.text).toContain("<title>Gahezlak</title>");

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("/shops/Fauget/menu");
    expect(warnings[0]).toContain("Fauget");
    expect(warnings[0]).toContain("timeout");
    expect(warnings[0]).toContain("generic <head>");
  });

  it("retries once, within the total budget, when the first attempt times out", async () => {
    const fetchSpy = sleepingFetch();
    vi.stubGlobal("fetch", fetchSpy);

    await request(app(FAST_BUDGET)).get("/shops/Fauget");

    // A cold Render instance often rejects fast and then answers; one retry
    // inside the budget is what rescues that, and the log says how many ran.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(warnings[0]).toContain("2 attempt(s)");
  });

  it("does not retry when the total budget leaves no room", async () => {
    const fetchSpy = sleepingFetch();
    vi.stubGlobal("fetch", fetchSpy);

    // Budget exhausted by the first attempt: the ceiling is the promise made
    // to a waiting scraper, and it outranks the retry.
    await request(app({ shopApiTimeoutMs: 40, shopApiTotalBudgetMs: 40 })).get(
      "/shops/Fauget",
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(warnings[0]).toContain("1 attempt(s)");
  });

  it("warns with the status when the API answers non-2xx, and retries a 5xx", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(null, false, 502));
    vi.stubGlobal("fetch", fetchSpy);

    const res = await request(app(FAST_BUDGET)).get("/shops/Fauget");

    expect(res.status).toBe(200);
    expect(res.text).toContain("<title>Gahezlak</title>");
    expect(warnings[0]).toContain("http: HTTP 502");
    // 502 is what Render's router emits while an instance is spinning up.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 404 — the slug simply isn't a shop", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(null, false, 404));
    vi.stubGlobal("fetch", fetchSpy);

    await request(app(FAST_BUDGET)).get("/shops/does-not-exist");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(warnings[0]).toContain("HTTP 404");
  });

  it("distinguishes a connection failure from a timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    await request(app(FAST_BUDGET)).get("/shops/Fauget");

    // "timed out" and "refused" have different fixes, so the log must not
    // flatten them into one another.
    expect(warnings[0]).toContain("network: ECONNREFUSED");
    expect(warnings[0]).not.toContain("timeout:");
  });

  it("warns when the API answers 200 with nothing usable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ data: null })),
    );

    const res = await request(app()).get("/shops/ghost");

    expect(res.status).toBe(200);
    expect(warnings[0]).toContain("no usable data");
  });

  it("warns when the sitemap's shop list is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    const res = await request(app()).get("/sitemap.xml");

    // A sitemap listing no shops looks identical to a site that has none.
    expect(res.status).toBe(200);
    expect(warnings[0]).toContain("/sitemap.xml");
    expect(warnings[0]).toContain("ECONNREFUSED");
  });
});

describe("GET /sitemap.xml", () => {
  it("lists shops returned by the backend", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          data: [
            { shopName: "test-bistro", updatedAt: "2026-08-01T00:00:00.000Z" },
            { shopName: "second-shop", updatedAt: "2026-08-02T00:00:00.000Z" },
          ],
        }),
      ),
    );

    const res = await request(app()).get("/sitemap.xml");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/xml");
    expect(res.text).toContain("<urlset");
    expect(res.text).toContain("test-bistro");
    expect(res.text).toContain("second-shop");
  });

  it("still returns a valid sitemap when the backend is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    const res = await request(app()).get("/sitemap.xml");

    // A 500 here would tell a crawler the whole site is broken.
    expect(res.status).toBe(200);
    expect(res.text).toContain("<urlset");
    expect(res.text).toContain("</urlset>");
  });

  it("honours SITE_URL as the canonical origin when configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ data: [] })),
    );

    const configured = createApp({
      apiBase: API_BASE,
      distDir,
      siteUrl: "https://gahezlak.com",
    });
    const res = await request(configured).get("/sitemap.xml");

    expect(res.text).toContain("<loc>https://gahezlak.com/</loc>");
  });
});

describe("static assets and headers", () => {
  it("serves hashed assets immutably", async () => {
    const res = await request(app()).get("/assets/index-abc123.js");

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toContain("immutable");
  });

  it("sends the security headers ported out of vercel.json", async () => {
    const res = await request(app()).get("/");

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["referrer-policy"]).toBe(
      "strict-origin-when-cross-origin",
    );
    const csp = res.headers["content-security-policy"];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'self'");
    // connect-src must follow the configured API origin, not a hardcoded host.
    expect(csp).toContain("https://api.example.test");
  });

  it("answers Render's health check without touching the backend", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const res = await request(app()).get("/healthz");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("API cold-start pre-warm", () => {
  /** Mirrors `jsonResponse` but for the shop lookup the SPA handler makes. */
  function shopResponse() {
    return jsonResponse({ data: { name: "Test Bistro" } });
  }

  it("is off unless explicitly enabled", async () => {
    const warmFetch = vi.fn(async () => shopResponse());
    vi.stubGlobal("fetch", warmFetch);

    // No `warmApi` in config at all — the default the tests and local dev use.
    await request(app()).get("/shops/test-bistro");

    // The SEO lookup happens as always; nothing is aimed at /health.
    expect(warmFetch).toHaveBeenCalled();
    expect(warmFetch).not.toHaveBeenCalledWith(
      "https://api.example.test/health",
      expect.anything(),
    );
  });

  it("pings the API health endpoint as the server boots", async () => {
    const warmFetch = vi.fn(async () => jsonResponse({ status: "ok" }));

    createApp({
      apiBase: API_BASE,
      distDir,
      warmApi: {
        enabled: true,
        fetchImpl: warmFetch as unknown as typeof fetch,
        log: () => {},
      },
    });

    // The point of the whole exercise: this happens while the frontend process
    // is still starting, so the API's ~50s wake overlaps ours instead of
    // queueing behind it.
    expect(warmFetch).toHaveBeenCalledWith(
      "https://api.example.test/health",
      expect.anything(),
    );
  });

  it("warms again for a shop page, throttled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => shopResponse()),
    );
    const warmFetch = vi.fn(async () => jsonResponse({ status: "ok" }));
    let clock = 1_000_000;

    const warmed = createApp({
      apiBase: API_BASE,
      distDir,
      warmApi: {
        enabled: true,
        throttleMs: 60_000,
        fetchImpl: warmFetch as unknown as typeof fetch,
        now: () => clock,
        log: () => {},
      },
    });
    expect(warmFetch).toHaveBeenCalledTimes(1); // boot

    // This server can stay awake serving static assets while the API sleeps on
    // its own clock, so a shop request is a second chance to wake it early.
    clock += 60_001;
    await request(warmed).get("/shops/test-bistro");
    expect(warmFetch).toHaveBeenCalledTimes(2);

    // Within the window, further requests must cost nothing — burning the free
    // instance-hour allowance is the failure mode this guards against.
    await request(warmed).get("/shops/test-bistro");
    await request(warmed).get("/shops/test-bistro/menu");
    expect(warmFetch).toHaveBeenCalledTimes(2);
  });

  it("does not warm on non-shop routes", async () => {
    const warmFetch = vi.fn(async () => jsonResponse({ status: "ok" }));
    let clock = 1_000_000;

    const warmed = createApp({
      apiBase: API_BASE,
      distDir,
      warmApi: {
        enabled: true,
        throttleMs: 60_000,
        fetchImpl: warmFetch as unknown as typeof fetch,
        now: () => clock,
        log: () => {},
      },
    });
    warmFetch.mockClear(); // drop the boot ping

    clock += 60_001;
    await request(warmed).get("/login");
    await request(warmed).get("/healthz");
    await request(warmed).get("/assets/index-abc123.js");

    expect(warmFetch).not.toHaveBeenCalled();
  });

  it("serves the page normally when the warm-up fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => shopResponse()),
    );

    const warmed = createApp({
      apiBase: API_BASE,
      distDir,
      warmApi: {
        enabled: true,
        throttleMs: 0,
        fetchImpl: (async () => {
          throw new Error("ECONNREFUSED");
        }) as unknown as typeof fetch,
        log: () => {},
      },
    });

    const res = await request(warmed).get("/shops/test-bistro");

    // A failed warm-up must be completely invisible to the visitor.
    expect(res.status).toBe(200);
    expect(res.text).toContain("Test Bistro");
  });
});

describe("Open Graph image absolutisation", () => {
  it("serves an absolute og:image on plain SPA routes", async () => {
    const res = await request(app()).get("/login");

    // index.html ships content="/Logo.png"; scrapers drop relative OG images,
    // so every shared link would have had no preview picture at all.
    expect(res.text).not.toContain('content="/Logo.png"');
    expect(res.text).toMatch(/content="https?:\/\/[^"]+\/Logo\.png"/);
  });

  it("serves an absolute og:image on shop pages with no logo of their own", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ data: { name: "Test Bistro" } })),
    );

    const res = await request(app()).get("/shops/test-bistro");

    expect(res.text).toContain("Test Bistro");
    expect(res.text).not.toContain('content="/Logo.png"');
  });
});
