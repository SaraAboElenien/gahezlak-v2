/**
 * Pure helpers for rewriting the SPA's static `index.html` <head> with a
 * specific shop's real metadata.
 *
 * These are deliberately runtime-agnostic (no `fetch`, no host-platform
 * imports, no DOM) so they can be unit-tested directly — see `seo.test.ts`.
 * `../index.ts` is the only thing that wires them to real I/O. That split is
 * what made migrating off Vercel Edge Middleware to a plain Render web
 * service a matter of replacing the glue and nothing else.
 *
 * SECURITY: shop names/types/addresses are user-supplied and end up inside
 * HTML attributes and inside a `<script type="application/ld+json">` block.
 * Both contexts need escaping, and they need *different* escaping — hence two
 * separate helpers below. An unescaped `"` breaks out of a meta attribute; an
 * unescaped `</script` breaks out of the JSON-LD block. Either is stored XSS.
 */

export interface ShopSeoSource {
  name?: string;
  type?: string;
  logoUrl?: string;
  address?: {
    country?: string;
    city?: string;
    street?: string;
  } | null;
}

export interface ShopSeoTags {
  /** Already includes the " | Gahezlak" suffix. */
  title: string;
  description: string;
  /** Absolute image URL, or undefined to keep index.html's default. */
  image?: string;
  canonicalUrl: string;
  jsonLd: Record<string, unknown>;
}

const SITE_NAME = "Gahezlak";
const MAX_DESCRIPTION_LENGTH = 300;

/**
 * Escapes a value for interpolation into HTML text or a double/single-quoted
 * HTML attribute. Ampersand must be replaced first or the other replacements'
 * own ampersands get double-escaped.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Serialises a value as JSON that is safe to place inside an inline
 * `<script type="application/ld+json">` block.
 *
 * `JSON.stringify` alone is NOT enough: it happily emits a literal
 * `</script>` inside a string, which the HTML parser treats as the end of the
 * script element, letting anything after it become live markup. Escaping
 * `<`, `>` and `&` as `\uXXXX` sequences is still valid JSON (and parses back
 * to the identical string) while making that breakout impossible. U+2028 /
 * U+2029 are escaped too — they're valid in JSON but are line terminators in
 * JavaScript, which trips some consumers.
 *
 * Returns `null` (the JSON literal) for values `JSON.stringify` can't
 * represent, so the caller never emits an empty/invalid script body.
 */
export function escapeJsonLd(value: unknown): string {
  const json = JSON.stringify(value);
  if (typeof json !== "string") return "null";
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Collapses all whitespace runs (including newlines) into single spaces. */
function normalise(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * Builds the tag set for one shop.
 *
 * Wording is kept deliberately identical to what `src/components/Seo.tsx` +
 * `src/pages/restaurant/slug/ShopLayout.tsx` render client-side, so the
 * pre-hydration <head> and the post-hydration <head> don't contradict each
 * other (a crawler that *does* execute JS would otherwise see the page's
 * title change under it).
 *
 * Returns `null` when there isn't enough real data to beat the generic
 * defaults — the caller must then leave index.html untouched.
 */
export function buildShopSeoTags(
  shop: ShopSeoSource | null | undefined,
  canonicalUrl: string,
): ShopSeoTags | null {
  const name = normalise(shop?.name);
  if (!name) return null;

  const type = normalise(shop?.type);
  const street = normalise(shop?.address?.street);
  const city = normalise(shop?.address?.city);
  const country = normalise(shop?.address?.country);
  const location = [city, country].filter(Boolean).join(", ");

  let description = `Order online from ${name}`;
  if (type) description += `, ${type}`;
  if (location) description += ` in ${location}`;
  description += ". View the full menu and order now on Gahezlak.";

  const logoUrl = normalise(shop?.logoUrl);
  const image = isAbsoluteHttpUrl(logoUrl) ? logoUrl : undefined;

  // Mirrors ShopLayout.tsx's Restaurant JSON-LD exactly. Undefined values are
  // dropped by JSON.stringify, so partial addresses degrade cleanly.
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name,
    image: image || undefined,
    url: canonicalUrl,
    servesCuisine: type || undefined,
    address: {
      "@type": "PostalAddress",
      streetAddress: street || undefined,
      addressLocality: city || undefined,
      addressCountry: country || undefined,
    },
  };

  return {
    title: `${name} — Menu & Online Ordering | ${SITE_NAME}`,
    description: truncate(description, MAX_DESCRIPTION_LENGTH),
    image,
    canonicalUrl,
    jsonLd,
  };
}

/** Appends a tag as the last child of <head>, matching the existing indent. */
function insertIntoHead(html: string, tag: string): string {
  const match = /([ \t]*)<\/head>/i.exec(html);
  if (!match) return html;
  const indent = match[1] ?? "";
  const rest = html.slice(match.index + indent.length);
  return `${html.slice(0, match.index)}${indent}  ${tag}\n${indent}${rest}`;
}

/**
 * Replaces an existing `<meta name|property="key" …>` in place, or appends one
 * just before `</head>` if it isn't there yet.
 *
 * Replacing rather than appending matters: a page carrying two `<title>` or
 * two `og:image` tags is worse than one wrong one, because which of them a
 * given scraper picks is undefined.
 */
export function upsertMetaTag(
  html: string,
  attr: "name" | "property",
  key: string,
  content: string,
): string {
  const tag = `<meta ${attr}="${escapeHtml(key)}" content="${escapeHtml(content)}" />`;
  // `[^>]*` also spans newlines, which matters — index.html formats its longer
  // meta tags across several lines.
  const existing = new RegExp(
    `<meta\\b[^>]*\\b${attr}=["']${escapeRegExp(key)}["'][^>]*>`,
    "i",
  );
  return existing.test(html)
    ? html.replace(existing, tag)
    : insertIntoHead(html, tag);
}

export function setTitle(html: string, title: string): string {
  const existing = /<title\b[^>]*>[\s\S]*?<\/title>/i;
  const tag = `<title>${escapeHtml(title)}</title>`;
  return existing.test(html)
    ? html.replace(existing, tag)
    : insertIntoHead(html, tag);
}

export function setCanonical(html: string, href: string): string {
  const existing = /<link\b[^>]*\brel=["']canonical["'][^>]*>/i;
  const tag = `<link rel="canonical" href="${escapeHtml(href)}" />`;
  return existing.test(html)
    ? html.replace(existing, tag)
    : insertIntoHead(html, tag);
}

export function setJsonLd(html: string, data: unknown): string {
  // Drop any pre-existing ld+json blocks first so we never emit two competing
  // structured-data entities for the same page.
  const stripped = html.replace(
    /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
  return insertIntoHead(
    stripped,
    `<script type="application/ld+json">${escapeJsonLd(data)}</script>`,
  );
}

/**
 * The whole head rewrite, as one pure string -> string transform.
 *
 * Note `og:image` / `twitter:image` are only overridden when the shop has a
 * real absolute logo URL — otherwise index.html's `/Logo.png` default is left
 * alone rather than replaced with something broken.
 */
export function injectShopSeo(html: string, tags: ShopSeoTags): string {
  let out = setTitle(html, tags.title);

  out = upsertMetaTag(out, "name", "description", tags.description);

  out = upsertMetaTag(out, "property", "og:type", "website");
  out = upsertMetaTag(out, "property", "og:site_name", SITE_NAME);
  out = upsertMetaTag(out, "property", "og:title", tags.title);
  out = upsertMetaTag(out, "property", "og:description", tags.description);
  out = upsertMetaTag(out, "property", "og:url", tags.canonicalUrl);
  if (tags.image) out = upsertMetaTag(out, "property", "og:image", tags.image);

  out = upsertMetaTag(
    out,
    "name",
    "twitter:card",
    tags.image ? "summary_large_image" : "summary",
  );
  out = upsertMetaTag(out, "name", "twitter:title", tags.title);
  out = upsertMetaTag(out, "name", "twitter:description", tags.description);
  if (tags.image) out = upsertMetaTag(out, "name", "twitter:image", tags.image);

  out = setCanonical(out, tags.canonicalUrl);
  out = setJsonLd(out, tags.jsonLd);

  return out;
}

/**
 * Rewrites root-relative `og:image` / `twitter:image` values to absolute URLs.
 *
 * index.html ships `content="/Logo.png"` for both. Open Graph requires an
 * absolute URL — Facebook, WhatsApp, X and iMessage do not resolve a relative
 * one against the page, they simply drop the image — so every page whose shop
 * has no absolute logo of its own (and the landing page, always) was sharing
 * with no preview image at all. That is invisible in the served HTML, which
 * looks perfectly reasonable, and only shows up when someone pastes a link.
 *
 * Applied to every HTML response rather than only rewritten shop pages,
 * because the defaults in index.html are what the other routes actually serve.
 * Values that are already absolute, protocol-relative, or data: URIs are left
 * untouched.
 */
export function absolutiseImageMeta(html: string, origin: string): string {
  const base = origin.replace(/\/+$/, "");
  if (!base) return html;

  return html.replace(
    /(<meta\b[^>]*\b(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*\bcontent=["'])(\/[^"'/][^"']*)(["'])/gi,
    (_match, prefix: string, value: string, suffix: string) =>
      `${prefix}${base}${value}${suffix}`,
  );
}

/**
 * Extracts the shop slug from a `/shops/:slug/...` pathname, or `null` if the
 * path isn't a shop page. Percent-decoded, since shop names can contain
 * spaces and non-ASCII characters.
 */
export function shopSlugFromPathname(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "shops" || !segments[1]) return null;
  try {
    const slug = decodeURIComponent(segments[1]).trim();
    return slug || null;
  } catch {
    // Malformed percent-encoding — not a URL we can look up.
    return null;
  }
}

/**
 * The canonical path for a shop URL.
 *
 * Only two of `ShopLayout`'s child routes are real content: the shop landing
 * page and `/menu` — those are the two the dynamic sitemap lists, and they
 * self-canonicalise. The rest (`cart`, `saved`, `track`,
 * `orders/checkout/:orderNumber`) are per-visitor state with nothing to index,
 * so they point at the shop's landing page instead. That keeps the canonical
 * tags and the sitemap telling search engines the same story, while a link to
 * e.g. a cart URL shared on WhatsApp still previews as the shop.
 *
 * Returns the input unchanged if it isn't a shop path at all.
 */
export function canonicalShopPath(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "shops" || !segments[1]) return pathname;
  const root = `/shops/${segments[1]}`;
  return segments[2] === "menu" && segments.length === 3
    ? `${root}/menu`
    : root;
}
