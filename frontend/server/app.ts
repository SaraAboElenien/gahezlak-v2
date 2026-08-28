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
import { createApiWarmer, type ApiWarmerOptions } from "./lib/warm-api";

/**
 * Hard ceilings — a slow backend must never hang a page or a crawler.
 *
 * `SHOP_API_TIMEOUT_MS` is per *attempt* and is deliberately unchanged: a warm
 * API answers this in tens of milliseconds, so the happy path is byte-for-byte
 * what it was, and a single hung connection still can't hold a page for long.
 *
 * `SHOP_API_TOTAL_BUDGET_MS` is the ceiling across the retry (see
 * `fetchShopForSeo`). 6s is chosen against the consumer that matters here:
 * link-preview scrapers. Facebook/WhatsApp, X and Slack all abandon a slow
 * page in roughly the 8–10s region, and this response is HTML that a human may
 * also be waiting on — so the whole lookup has to finish comfortably inside
 * that, with room for the TLS handshake and the SPA shell behind it. Anything
 * larger trades a rich preview for a page that feels broken, which is the
 * wrong way round: the page is the product, the metadata is the garnish.
 */
const SHOP_API_TIMEOUT_MS = 2500;
const SHOP_API_TOTAL_BUDGET_MS = 6000;
const SHOP_LIST_TIMEOUT_MS = 4000;

/**
 * Below this, a second attempt cannot complete a handshake, let alone a
 * request — spending the remainder just delays the fallback we already know
 * we're serving.
 */
const MIN_RETRY_BUDGET_MS = 250;

export interface WarmApiConfig extends Omit<ApiWarmerOptions, "apiBase"> {
  /**
   * Off unless explicitly switched on. Local dev and the tests must not fire
   * network requests at a backend just by constructing the app — see
   * `index.ts` for where the environment turns this on.
   */
  enabled: boolean;
}

export interface ServerConfig {
  /** Backend API base, e.g. https://gahezlak-api.onrender.com/api/v1 */
  apiBase: string;
  /** Canonical public origin for <loc>/og:url. Falls back to the request. */
  siteUrl?: string;
  /** Directory holding the Vite build output. */
  distDir: string;
  /**
   * Render free-tier cold-start mitigation. See `lib/warm-api.ts` — the short
   * version is that the two services sleep independently, so without this a
   * visitor waits ~50s for this server and then another ~50s for the API.
   * Omitted or `{ enabled: false }` makes it a complete no-op.
   */
  warmApi?: WarmApiConfig;
  /**
   * Where degraded-SEO warnings go. Injected for tests; defaults to
   * `console.warn`, which on Render is simply the service log.
   */
  logWarn?: (message: string) => void;
  /** Per-attempt abort budget for the per-shop lookup. Injected for tests. */
  shopApiTimeoutMs?: number;
  /** Ceiling across all attempts of the per-shop lookup. For tests. */
  shopApiTotalBudgetMs?: number;
}

/** Classification of why a per-shop metadata lookup didn't produce a shop. */
type ShopFetchFailureReason =
  /** Nothing came back inside the attempt's abort budget. */
  | "timeout"
  /** The API answered, with a status we can't use. */
  | "http"
  /** Connection-level failure: DNS, refused, reset, TLS. */
  | "network"
  /** A 2xx whose body wasn't the JSON we expect (proxy/WAF interstitial). */
  | "body";

interface ShopFetchSuccess {
  ok: true;
  /** Present-but-empty is a real answer: the slug matched no shop. */
  shop: ShopSeoSource | undefined;
}

interface ShopFetchFailure {
  ok: false;
  reason: ShopFetchFailureReason;
  detail: string;
  /** Whether a second attempt could plausibly give a different answer. */
  retryable: boolean;
}

/** The result of one request. */
type ShopFetchAttempt = ShopFetchSuccess | ShopFetchFailure;

/**
 * The result of the whole lookup. Written as an intersection rather than by
 * extending both members, so `Omit`ting the wrapper's fields off it stays
 * possible without collapsing the union it wraps.
 */
type ShopFetchOutcome = ShopFetchAttempt & {
  /** How many requests were actually issued (1 or 2). */
  attempts: number;
  elapsedMs: number;
};

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * `AbortSignal.timeout` rejects with a `TimeoutError` DOMException; a manual
 * abort (and some older runtimes) uses `AbortError`. Returns null for anything
 * that isn't the clock running out, so the caller can classify it properly
 * instead of blaming a slow backend for a refused connection.
 */
function asTimeoutFailure(
  error: unknown,
  timeoutMs: number,
): ShopFetchFailure | null {
  const name = error instanceof Error ? error.name : "";
  if (name !== "TimeoutError" && name !== "AbortError") return null;
  return {
    ok: false,
    reason: "timeout",
    detail: `no response within ${timeoutMs}ms`,
    retryable: true,
  };
}

export function createApp(config: ServerConfig): express.Express {
  const apiBase = config.apiBase.replace(/\/+$/, "");
  const siteUrl = (config.siteUrl ?? "").replace(/\/+$/, "");
  const indexHtmlPath = path.join(config.distDir, "index.html");
  const logWarn =
    config.logWarn ?? ((message: string) => console.warn(message));
  const shopApiTimeoutMs = config.shopApiTimeoutMs ?? SHOP_API_TIMEOUT_MS;
  const shopApiTotalBudgetMs =
    config.shopApiTotalBudgetMs ?? SHOP_API_TOTAL_BUDGET_MS;

  const { enabled: warmApiEnabled = false, ...warmerOptions } =
    config.warmApi ?? {};
  const warmer = warmApiEnabled
    ? createApiWarmer({ apiBase, ...warmerOptions })
    : null;

  // Deliberately not awaited: this fires while the process is still setting
  // itself up, so the API's ~50s wake-up overlaps ours instead of following
  // it. `warm()` swallows every failure, so a dead API costs us nothing here.
  void warmer?.warm("boot");

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
    } catch (error) {
      // Backend down, slow, or returning something unexpected — degrade to the
      // minimal sitemap above. Logged rather than swallowed: a sitemap that
      // silently lists no shops is indistinguishable, to a crawler and to us,
      // from a site that has none.
      logWarn(
        `[seo] /sitemap.xml: shop list unavailable (${describeError(error)}) — serving landing page only`,
      );
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

  /**
   * One request. Never throws — every way this can go wrong is returned as a
   * classified failure, because "the metadata is generic" and "the API is
   * unreachable from this container" have to be distinguishable in the log.
   */
  async function attemptFetchShop(
    slug: string,
    timeoutMs: number,
  ): Promise<ShopFetchAttempt> {
    // Matches `publicShopApi.getShopDetails` — GET {base}/shops/name/:shopName.
    let response: Response;
    try {
      response = await fetch(
        `${apiBase}/shops/name/${encodeURIComponent(slug)}`,
        {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
    } catch (error) {
      return (
        asTimeoutFailure(error, timeoutMs) ?? {
          ok: false,
          reason: "network",
          detail: describeError(error),
          retryable: true,
        }
      );
    }

    if (!response.ok) {
      return {
        ok: false,
        reason: "http",
        detail: `HTTP ${response.status}`,
        // A 4xx is an answer, not a hiccup — the slug genuinely isn't a shop,
        // and asking twice can't change that. 5xx and 429 are what a Render
        // instance emits while it is still coming up, so those get one retry.
        retryable: response.status >= 500 || response.status === 429,
      };
    }

    try {
      const payload = (await response.json()) as {
        data?: ShopSeoSource;
      } | null;
      return { ok: true, shop: payload?.data };
    } catch (error) {
      return (
        asTimeoutFailure(error, timeoutMs) ?? {
          ok: false,
          reason: "body",
          // A 2xx that isn't JSON is a proxy or WAF interstitial, not a slow
          // backend; the retry would fetch the identical page.
          detail: describeError(error),
          retryable: false,
        }
      );
    }
  }

  /**
   * The per-shop lookup, with at most one retry inside a fixed total budget.
   *
   * WHY RETRY AT ALL: the failure this exists for is a cold Render API, and
   * that has two signatures. It can hang (we abort at `shopApiTimeoutMs`), or
   * — while the instance is spinning up — Render's router can reject in
   * milliseconds with a 5xx or a reset. The second kind is the one a retry
   * genuinely rescues, because the first attempt cost almost nothing and the
   * warm-up fired just above may have landed in between.
   *
   * WHY IT'S BOUNDED BY TIME, NOT BY COUNT: budget, not attempt count, is what
   * a waiting scraper actually experiences. Retrying only while there is time
   * left means a fast failure gets a real second chance while a slow one
   * doesn't stack two full timeouts on top of each other.
   *
   * This does NOT pretend to survive a genuine ~50s cold start; nothing at
   * this layer can, and holding the page hostage waiting for one would be a
   * far worse trade. Waking the API early is `lib/warm-api.ts`'s job.
   */
  async function fetchShopForSeo(slug: string): Promise<ShopFetchOutcome> {
    const startedAt = Date.now();
    const first = await attemptFetchShop(
      slug,
      Math.min(shopApiTimeoutMs, shopApiTotalBudgetMs),
    );
    if (first.ok || !first.retryable) {
      return { ...first, attempts: 1, elapsedMs: Date.now() - startedAt };
    }

    // Capped by the per-attempt budget as well, so a deployment (or a test)
    // that deliberately runs on a tiny budget doesn't have the floor exceed
    // the whole attempt and quietly disable the retry.
    const minRetryBudget = Math.min(MIN_RETRY_BUDGET_MS, shopApiTimeoutMs);
    const remaining = shopApiTotalBudgetMs - (Date.now() - startedAt);
    if (remaining < minRetryBudget) {
      return { ...first, attempts: 1, elapsedMs: Date.now() - startedAt };
    }

    const second = await attemptFetchShop(
      slug,
      Math.min(shopApiTimeoutMs, remaining),
    );
    return { ...second, attempts: 2, elapsedMs: Date.now() - startedAt };
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

    // A shop page is the one route we *know* needs the API a moment later:
    // React immediately fetches the menu, the categories and the shop. This
    // server stays awake serving static assets long after the API has gone to
    // sleep on its own 15-minute clock, so the boot-time warm above is not
    // enough on its own.
    //
    // Cheap by construction: the `fetchShop` call directly below already hits
    // the API on every one of these requests, so this adds no new *class* of
    // traffic — only a second call with a cold-start-sized budget instead of a
    // 2.5s one, at most once per throttle window. Non-shop routes (and every
    // static asset, which never reaches this handler) are untouched, which is
    // what keeps crawler traffic from holding the API awake and eating the
    // free instance-hour allowance.
    void warmer?.warm(`request ${req.path}`);

    /**
     * The degraded path, taken whenever we couldn't build real tags.
     *
     * It must stay a 200 with the plain SPA — a slow or broken backend costs
     * us the rich preview, never the page itself. But it must not stay
     * *silent*: this is exactly the shape that made a cold-start miss
     * invisible, serving crawlers and scrapers the generic <head> with a 200
     * and nothing anywhere to show it had happened.
     */
    function sendGeneric(why: string) {
      logWarn(
        `[seo] ${req.path}: shop "${slug}" ${why} — serving generic <head>`,
      );
      res.setHeader("cache-control", "no-cache");
      return res.status(200).send(html);
    }

    try {
      const outcome = await fetchShopForSeo(slug);
      if (!outcome.ok) {
        return sendGeneric(
          `lookup failed (${outcome.reason}: ${outcome.detail}) after ` +
            `${outcome.attempts} attempt(s) in ${outcome.elapsedMs}ms`,
        );
      }

      const canonicalUrl = `${origin}${canonicalShopPath(req.path)}`;
      const tags = buildShopSeoTags(outcome.shop, canonicalUrl);
      if (!tags) {
        // The API answered, and had nothing usable to say. Ordinary for a slug
        // nobody has ever registered; a signal if it's a shop that exists.
        return sendGeneric(`returned no usable data in ${outcome.elapsedMs}ms`);
      }

      // Per-shop HTML is stable and its URL unique per shop, so let any CDN in
      // front absorb crawler traffic instead of re-running this every hit.
      res.setHeader(
        "cache-control",
        "public, max-age=0, s-maxage=300, stale-while-revalidate=86400",
      );
      return res.status(200).send(injectShopSeo(html, tags));
    } catch (error) {
      // `fetchShopForSeo` doesn't throw, so reaching here means the rewrite
      // itself did — a bug, not a backend problem, and worth saying so.
      return sendGeneric(`rewrite threw (${describeError(error)})`);
    }
  });

  return app;
}
