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
import { createApp } from "./app";

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

beforeEach(() => {
  vi.restoreAllMocks();
});

function app() {
  return createApp({ apiBase: API_BASE, distDir });
}

/** Minimal stand-in for the shape the routes read off a fetch Response. */
function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  } as unknown as Response;
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
