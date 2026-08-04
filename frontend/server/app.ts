/**
 * Builds the production server for the built SPA.
 *
 * WHY A SERVER AT ALL
 * -------------------
 * A plain static host would be cheaper, but this app is 100% client-rendered:
 * `react-helmet-async` only sets tags *after* React executes, so non-JS
 * crawlers and every social link-preview scraper (WhatsApp, Facebook, X,
 * Slack, iMessage) see nothing but the generic <head> in index.html — every
 * restaurant sharing one identical preview. Two routes need real server work:
 *
 *   GET /shops/:slug*  -> rewrite index.html's <head> with that shop's real
 *                         title/description/OG/JSON-LD before it goes out.
 *   GET /sitemap.xml   -> enumerate shops from the backend on demand; they are
 *                         created after deployment and unknowable at build time.
 *
 * This replaces the Vercel Edge Middleware and Vercel Function that previously
 * did those two jobs. The interesting logic was always in `lib/seo.ts` and
 * `lib/sitemap.ts`, which are pure and runtime-agnostic (and unit-tested) —
 * only the platform glue changed.
 *
 * NOT USER-AGENT SNIFFING: the transformed HTML goes to every visitor, bot or
 * human. Serving crawlers different content than humans is cloaking and gets
 * penalised. Humans see no difference — React hydrates over the same markup
 * and Helmet re-applies identical tags.
 *
 * Config is injected rather than read from `process.env` here so the whole
 * thing is testable without a live backend or a real build directory — see
 * `app.test.ts`. `index.ts` is what turns environment into config and listens.
 */
import express from "express";
import compression from "compression";
import fs from "node:fs";
import path from "node:path";

import {
  absolutiseImageMeta,
  buildShopSeoTags,
  canonicalShopPath,
  injectShopSeo,
  shopSlugFromPathname,
  type ShopSeoSource,
} from "./lib/seo";
import {
  buildShopSitemapEntries,
  buildSitemapXml,
  type PublicShopListItem,
  type SitemapEntry,
} from "./lib/sitemap";

/** Hard ceilings — a slow backend must never hang a page or a crawler. */
const SHOP_API_TIMEOUT_MS = 2500;
const SHOP_LIST_TIMEOUT_MS = 4000;

export interface ServerConfig {
  /** Backend API base, e.g. https://gahezlak-api.onrender.com/api/v1 */
  apiBase: string;
  /** Canonical public origin for <loc>/og:url. Falls back to the request. */
  siteUrl?: string;
  /** Directory holding the Vite build output. */
  distDir: string;
}

export function createApp(config: ServerConfig): express.Express {
  const apiBase = config.apiBase.replace(/\/+$/, "");
  const siteUrl = (config.siteUrl ?? "").replace(/\/+$/, "");
  const indexHtmlPath = path.join(config.distDir, "index.html");

  const app = express();

  // Render terminates TLS at its proxy and forwards X-Forwarded-*. Without
  // this, req.protocol is always "http" and every canonical/OG URL we emit
  // would be wrong — which for SEO metadata is the whole point.
  app.set("trust proxy", true);

  app.use(compression());

  // Ported from the old vercel.json `headers` block so the deployed security
  // posture is unchanged by the migration. connect-src is derived from the API
  // base rather than hardcoded, so it follows the environment instead of
  // silently blocking XHR the day the backend URL changes.
  const apiOrigin = (() => {
    try {
      return new URL(apiBase).origin;
    } catch {
      return "";
    }
  })();

  app.use((_req, res, next) => {
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ""} https://*.sentry.io`,
        "frame-src 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'self'",
      ].join("; "),
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  /** Render's health check. Static-only, so it never depends on the backend. */
  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  function resolveOrigin(req: express.Request): string {
    if (siteUrl) return siteUrl;
    return `${req.protocol}://${req.get("host") ?? ""}`;
  }

  async function fetchShops(): Promise<PublicShopListItem[]> {
    // Contract: GET {base}/shops/public/list
    //   -> 200 { message: string, data: [{ shopName, updatedAt }] }
    const response = await fetch(`${apiBase}/shops/public/list`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(SHOP_LIST_TIMEOUT_MS),
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      data?: PublicShopListItem[];
    } | null;
    return Array.isArray(payload?.data) ? payload.data : [];
  }

  app.get("/sitemap.xml", async (req, res) => {
    const origin = resolveOrigin(req);

    // The landing page is always listed, so an unreachable backend still
    // yields a valid sitemap rather than a 500 that makes the site look broken
    // to a crawler.
    const entries: SitemapEntry[] = [
      { loc: `${origin}/`, changefreq: "weekly", priority: "1.0" },
    ];

    try {
      entries.push(...buildShopSitemapEntries(origin, await fetchShops()));
    } catch {
      // Backend down, slow, or returning something unexpected — degrade to the
      // minimal sitemap above.
    }

    res.setHeader("content-type", "application/xml; charset=utf-8");
    res.setHeader(
      "cache-control",
      "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    );
    res.status(200).send(buildSitemapXml(entries));
  });

  /**
   * Hashed asset filenames are content-addressed, so they can be cached
   * forever. index.html must never be: a stale one pins users to a deleted
   * asset bundle. `index: false` keeps this from answering "/" itself — that
   * belongs to the SPA handler below, which is what makes the <head> rewrite
   * reachable.
   */
  app.use(
    express.static(config.distDir, {
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("cache-control", "public, max-age=31536000, immutable");
        }
      },
    }),
  );

  /** Read once and keep — dist/index.html can't change while we run. */
  let cachedIndexHtml: string | null = null;
  function readIndexHtml(): string {
    if (cachedIndexHtml === null) {
      cachedIndexHtml = fs.readFileSync(indexHtmlPath, "utf8");
    }
    return cachedIndexHtml;
  }

  async function fetchShop(slug: string): Promise<ShopSeoSource | undefined> {
    // Matches `publicShopApi.getShopDetails` — GET {base}/shops/name/:shopName.
    const response = await fetch(
      `${apiBase}/shops/name/${encodeURIComponent(slug)}`,
      {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(SHOP_API_TIMEOUT_MS),
      },
    );
    if (!response.ok) return undefined;
    const payload = (await response.json()) as { data?: ShopSeoSource } | null;
    return payload?.data;
  }

  // SPA fallback, plus the per-shop <head> rewrite. Registered with `app.use`
  // rather than a wildcard route on purpose: Express 5's path-to-regexp no
  // longer accepts a bare "*", and spelling it "/*splat" buys nothing here.
  app.use(async (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();

    let html: string;
    try {
      html = readIndexHtml();
    } catch {
      // Build output missing — a deploy problem, not a request problem.
      return next();
    }

    res.setHeader("content-type", "text/html; charset=utf-8");

    // index.html's default og:image/twitter:image are root-relative, which
    // scrapers refuse to resolve. Fix them on every HTML response, not just
    // rewritten shop pages — the other routes serve those defaults verbatim.
    const origin = resolveOrigin(req);
    html = absolutiseImageMeta(html, origin);

    const slug = shopSlugFromPathname(req.path);
    if (!slug) {
      res.setHeader("cache-control", "no-cache");
      return res.status(200).send(html);
    }

    // Everything below degrades to the untouched index.html rather than taking
    // a shop's page down: a slow or broken backend must cost us the rich
    // preview, never the page itself.
    try {
      const shop = await fetchShop(slug);
      const canonicalUrl = `${origin}${canonicalShopPath(req.path)}`;
      const tags = buildShopSeoTags(shop, canonicalUrl);
      if (!tags) {
        res.setHeader("cache-control", "no-cache");
        return res.status(200).send(html);
      }

      // Per-shop HTML is stable and its URL unique per shop, so let any CDN in
      // front absorb crawler traffic instead of re-running this every hit.
      res.setHeader(
        "cache-control",
        "public, max-age=0, s-maxage=300, stale-while-revalidate=86400",
      );
      return res.status(200).send(injectShopSeo(html, tags));
    } catch {
      res.setHeader("cache-control", "no-cache");
      return res.status(200).send(html);
    }
  });

  return app;
}
