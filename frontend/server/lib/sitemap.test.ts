import { describe, it, expect } from "vitest";

import {
  buildShopSitemapEntries,
  buildSitemapXml,
  escapeXml,
  toSitemapDate,
} from "./sitemap";

const ORIGIN = "https://gahezlak.example";

function countOccurrences(haystack: string, needle: RegExp): number {
  return haystack.match(needle)?.length ?? 0;
}

describe("escapeXml", () => {
  it("escapes every character that would invalidate the document", () => {
    expect(escapeXml(`Ben & Jerry's <"x">`)).toBe(
      "Ben &amp; Jerry&apos;s &lt;&quot;x&quot;&gt;",
    );
  });

  it("escapes ampersands first so entities are not double-escaped", () => {
    expect(escapeXml("&lt;")).toBe("&amp;lt;");
  });
});

describe("toSitemapDate", () => {
  it("reduces an ISO timestamp to a W3C date", () => {
    expect(toSitemapDate("2026-07-31T22:17:03.123Z")).toBe("2026-07-31");
  });

  it("returns undefined for anything unparseable", () => {
    expect(toSitemapDate("not a date")).toBeUndefined();
    expect(toSitemapDate("")).toBeUndefined();
    expect(toSitemapDate(undefined)).toBeUndefined();
    expect(toSitemapDate(null)).toBeUndefined();
    expect(toSitemapDate(12345)).toBeUndefined();
  });
});

describe("buildSitemapXml", () => {
  it("emits a well-formed urlset with only the fields that were provided", () => {
    const xml = buildSitemapXml([
      { loc: `${ORIGIN}/`, changefreq: "weekly", priority: "1.0" },
      { loc: `${ORIGIN}/shops/a`, lastmod: "2026-07-31" },
    ]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
    expect(countOccurrences(xml, /<url>/g)).toBe(2);
    expect(xml).toContain("<lastmod>2026-07-31</lastmod>");
    // The second entry had no changefreq/priority, so only the first does.
    expect(countOccurrences(xml, /<changefreq>/g)).toBe(1);
    expect(countOccurrences(xml, /<priority>/g)).toBe(1);
  });

  it("escapes user-supplied text inside <loc>", () => {
    const xml = buildSitemapXml([{ loc: `${ORIGIN}/shops/A&B` }]);
    expect(xml).toContain("<loc>https://gahezlak.example/shops/A&amp;B</loc>");
    expect(xml).not.toMatch(/<loc>[^<]*&(?!amp;|lt;|gt;|quot;|apos;)/);
  });

  it("still produces a valid document with no entries", () => {
    const xml = buildSitemapXml([]);
    expect(xml).toContain("<urlset");
    expect(xml).toContain("</urlset>");
    expect(countOccurrences(xml, /<url>/g)).toBe(0);
  });
});

describe("buildShopSitemapEntries", () => {
  it("emits the landing page and menu URL for each shop", () => {
    const entries = buildShopSitemapEntries(ORIGIN, [
      { shopName: "Test Bistro", updatedAt: "2026-07-31T10:00:00.000Z" },
    ]);
    expect(entries).toEqual([
      {
        loc: `${ORIGIN}/shops/Test%20Bistro`,
        lastmod: "2026-07-31",
        changefreq: "weekly",
        priority: "0.8",
      },
      {
        loc: `${ORIGIN}/shops/Test%20Bistro/menu`,
        lastmod: "2026-07-31",
        changefreq: "weekly",
        priority: "0.7",
      },
    ]);
  });

  it("percent-encodes names so they survive as URL path segments", () => {
    const entries = buildShopSitemapEntries(ORIGIN, [
      { shopName: "Café / Bar" },
    ]);
    expect(entries[0].loc).toBe(`${ORIGIN}/shops/Caf%C3%A9%20%2F%20Bar`);
  });

  it("drops blank names and de-duplicates repeated ones", () => {
    const entries = buildShopSitemapEntries(ORIGIN, [
      { shopName: "A" },
      { shopName: "A" },
      { shopName: "   " },
      { shopName: undefined },
      {},
    ]);
    expect(entries).toHaveLength(2);
    expect(entries[0].loc).toBe(`${ORIGIN}/shops/A`);
  });

  it("omits lastmod when updatedAt is missing or unparseable", () => {
    const entries = buildShopSitemapEntries(ORIGIN, [
      { shopName: "A", updatedAt: "nonsense" },
    ]);
    expect(entries[0].lastmod).toBeUndefined();
  });

  it("returns an empty list for a non-array payload rather than throwing", () => {
    expect(buildShopSitemapEntries(ORIGIN, null)).toEqual([]);
    expect(buildShopSitemapEntries(ORIGIN, undefined)).toEqual([]);
    expect(
      buildShopSitemapEntries(
        ORIGIN,
        "oops" as unknown as { shopName: string }[],
      ),
    ).toEqual([]);
  });
});
