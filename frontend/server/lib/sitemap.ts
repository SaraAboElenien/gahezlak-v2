/**
 * Pure helpers for building the dynamic sitemap. No I/O — see `../index.ts`
 * for the route that feeds real data into these.
 */

/**
 * The public shop-listing contract this is built against:
 *   GET {API_BASE}/shops/public/list
 *     -> 200 { "message": string, "data": [{ shopName, updatedAt }] }
 */
export interface PublicShopListItem {
  shopName?: string;
  updatedAt?: string;
}

export interface SitemapEntry {
  loc: string;
  /** W3C date (YYYY-MM-DD). */
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

/**
 * XML text/attribute escaping. Shop names are user-supplied and go straight
 * into `<loc>` — an unescaped `&` alone makes the whole document invalid XML,
 * and crawlers reject invalid sitemaps outright.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Sitemaps want `YYYY-MM-DD` (or full ISO). Returns undefined if unparseable. */
export function toSitemapDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

export function buildSitemapXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map((entry) => {
      const parts = [`    <loc>${escapeXml(entry.loc)}</loc>`];
      if (entry.lastmod)
        parts.push(`    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`);
      if (entry.changefreq) {
        parts.push(
          `    <changefreq>${escapeXml(entry.changefreq)}</changefreq>`,
        );
      }
      if (entry.priority)
        parts.push(`    <priority>${escapeXml(entry.priority)}</priority>`);
      return `  <url>\n${parts.join("\n")}\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

/**
 * Turns the backend's shop list into sitemap entries.
 *
 * Two URLs per shop, matching the two publicly reachable, indexable routes in
 * `Layout.tsx`: the shop landing page (`/shops/:slug`) and its menu
 * (`/shops/:slug/menu`). The other child routes (`cart`, `saved`, `track`,
 * `orders/checkout/*`) are per-visitor state, not content, so they're left
 * out deliberately.
 *
 * Duplicates and blank names are dropped — a sitemap listing the same URL
 * twice is treated as a quality signal against the site.
 */
export function buildShopSitemapEntries(
  origin: string,
  shops: PublicShopListItem[] | null | undefined,
): SitemapEntry[] {
  if (!Array.isArray(shops)) return [];

  const seen = new Set<string>();
  const entries: SitemapEntry[] = [];

  for (const shop of shops) {
    const name = typeof shop?.shopName === "string" ? shop.shopName.trim() : "";
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const base = `${origin}/shops/${encodeURIComponent(name)}`;
    const lastmod = toSitemapDate(shop?.updatedAt);

    entries.push({ loc: base, lastmod, changefreq: "weekly", priority: "0.8" });
    entries.push({
      loc: `${base}/menu`,
      lastmod,
      changefreq: "weekly",
      priority: "0.7",
    });
  }

  return entries;
}
