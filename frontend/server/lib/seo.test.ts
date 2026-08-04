import { describe, it, expect } from "vitest";

import {
  absolutiseImageMeta,
  buildShopSeoTags,
  canonicalShopPath,
  escapeHtml,
  escapeJsonLd,
  injectShopSeo,
  setCanonical,
  setJsonLd,
  setTitle,
  shopSlugFromPathname,
  upsertMetaTag,
} from "./seo";

/**
 * A faithful copy of the parts of `frontend/index.html` this transform cares
 * about, including its multi-line meta formatting — the regexes have to cope
 * with attributes split across lines, which a single-line fixture wouldn't
 * exercise.
 */
const INDEX_HTML = `<!doctype html>
<html lang="en" class="light" data-theme="light">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/png" href="/qr-hand.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Gahezlak — Digital Menus &amp; Ordering for Restaurants</title>
    <meta
      name="description"
      content="Gahezlak is a digital menu and ordering platform."
    />
    <meta name="robots" content="index, follow" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Gahezlak" />
    <meta property="og:title" content="Gahezlak — Digital Menus" />
    <meta
      property="og:description"
      content="Gahezlak is a digital menu and ordering platform."
    />
    <meta property="og:image" content="/Logo.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Gahezlak — Digital Menus" />
    <meta name="twitter:description" content="Gahezlak is a digital menu." />
    <meta name="twitter:image" content="/Logo.png" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const SHOP = {
  name: "Test Bistro",
  type: "Restaurant",
  logoUrl: "https://i.ibb.co/abc/logo.png",
  address: { street: "1 Main St", city: "Cairo", country: "Egypt" },
};

function countOccurrences(haystack: string, needle: RegExp): number {
  return haystack.match(needle)?.length ?? 0;
}

describe("escapeHtml", () => {
  it("escapes every character that can break out of an attribute or text node", () => {
    expect(escapeHtml(`<script>"x" & 'y'</script>`)).toBe(
      "&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;",
    );
  });

  it("escapes ampersands first so entities are not double-escaped", () => {
    expect(escapeHtml("A & B < C")).toBe("A &amp; B &lt; C");
    expect(escapeHtml("&amp;")).toBe("&amp;amp;");
  });

  it("leaves safe text untouched", () => {
    expect(escapeHtml("Café Zooba — Cairo")).toBe("Café Zooba — Cairo");
  });
});

describe("escapeJsonLd", () => {
  it("prevents a </script> breakout from a shop name", () => {
    const output = escapeJsonLd({
      name: `Evil</script><img src=x onerror=alert(1)>`,
    });
    expect(output).not.toContain("</script");
    expect(output).not.toContain("<");
    expect(output).not.toContain(">");
    expect(output).toContain("\\u003c");
  });

  it("stays valid JSON that round-trips to the original value", () => {
    const value = { name: `A</script> & <b>B</b>`, nested: { x: "<>" } };
    expect(JSON.parse(escapeJsonLd(value))).toEqual(value);
  });

  it("escapes JS line terminators that are legal in JSON", () => {
    const lineSeparator = String.fromCharCode(0x2028);
    const paragraphSeparator = String.fromCharCode(0x2029);
    const raw = `a${lineSeparator}b${paragraphSeparator}c`;
    const output = escapeJsonLd({ name: raw });
    expect(output).toContain("\\u2028");
    expect(output).toContain("\\u2029");
    expect(output).not.toContain(lineSeparator);
    expect(output).not.toContain(paragraphSeparator);
    expect(JSON.parse(output)).toEqual({ name: raw });
  });

  it("returns the JSON literal null rather than undefined for unserialisable input", () => {
    expect(escapeJsonLd(undefined)).toBe("null");
    expect(() => JSON.parse(escapeJsonLd(undefined))).not.toThrow();
  });
});

describe("buildShopSeoTags", () => {
  it("builds title/description/image/json-ld from real shop data", () => {
    const tags = buildShopSeoTags(
      SHOP,
      "https://example.com/shops/Test%20Bistro",
    );
    expect(tags).not.toBeNull();
    expect(tags!.title).toBe("Test Bistro — Menu & Online Ordering | Gahezlak");
    expect(tags!.description).toBe(
      "Order online from Test Bistro, Restaurant in Cairo, Egypt. View the full menu and order now on Gahezlak.",
    );
    expect(tags!.image).toBe("https://i.ibb.co/abc/logo.png");
    expect(tags!.jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Restaurant",
      name: "Test Bistro",
      servesCuisine: "Restaurant",
      url: "https://example.com/shops/Test%20Bistro",
      address: {
        "@type": "PostalAddress",
        streetAddress: "1 Main St",
        addressLocality: "Cairo",
        addressCountry: "Egypt",
      },
    });
  });

  it("returns null when there is no usable shop name", () => {
    expect(buildShopSeoTags(null, "https://example.com/shops/x")).toBeNull();
    expect(
      buildShopSeoTags(undefined, "https://example.com/shops/x"),
    ).toBeNull();
    expect(buildShopSeoTags({}, "https://example.com/shops/x")).toBeNull();
    expect(
      buildShopSeoTags({ name: "   " }, "https://example.com/shops/x"),
    ).toBeNull();
  });

  it("degrades cleanly when type/address are missing instead of printing undefined", () => {
    const tags = buildShopSeoTags(
      { name: "Solo" },
      "https://example.com/shops/Solo",
    );
    expect(tags!.description).toBe(
      "Order online from Solo. View the full menu and order now on Gahezlak.",
    );
    expect(tags!.description).not.toContain("undefined");
    expect(tags!.image).toBeUndefined();
  });

  it("ignores a logoUrl that is not an absolute http(s) URL", () => {
    expect(
      buildShopSeoTags(
        { name: "S", logoUrl: "javascript:alert(1)" },
        "https://e.com/s",
      )!.image,
    ).toBeUndefined();
    expect(
      buildShopSeoTags({ name: "S", logoUrl: "/local.png" }, "https://e.com/s")!
        .image,
    ).toBeUndefined();
  });

  it("collapses newlines in user-supplied fields", () => {
    const tags = buildShopSeoTags(
      { name: "Multi\n  Line", type: "Cafe\n" },
      "https://e.com/s",
    );
    expect(tags!.title).toBe("Multi Line — Menu & Online Ordering | Gahezlak");
  });

  it("truncates a pathologically long description", () => {
    const tags = buildShopSeoTags(
      { name: "x".repeat(1000) },
      "https://e.com/s",
    );
    expect(tags!.description.length).toBeLessThanOrEqual(300);
    expect(tags!.description.endsWith("…")).toBe(true);
  });
});

describe("upsertMetaTag / setTitle / setCanonical", () => {
  it("replaces an existing single-line meta instead of adding a second one", () => {
    const out = upsertMetaTag(
      INDEX_HTML,
      "property",
      "og:image",
      "https://x/y.png",
    );
    expect(countOccurrences(out, /property="og:image"/g)).toBe(1);
    expect(out).toContain(
      '<meta property="og:image" content="https://x/y.png" />',
    );
    expect(out).not.toContain(
      'content="/Logo.png" />\n    <meta name="twitter:card"',
    );
  });

  it("replaces a meta whose attributes are split across lines", () => {
    const out = upsertMetaTag(
      INDEX_HTML,
      "name",
      "description",
      "New description",
    );
    expect(countOccurrences(out, /name="description"/g)).toBe(1);
    expect(out).toContain(
      '<meta name="description" content="New description" />',
    );
    expect(out).not.toContain("a digital menu and ordering platform.\n    /");
  });

  it("does not confuse description with og:description or twitter:description", () => {
    const out = upsertMetaTag(INDEX_HTML, "name", "description", "NEW");
    expect(out).toContain('property="og:description"');
    expect(out).toContain('name="twitter:description"');
    expect(countOccurrences(out, /content="NEW"/g)).toBe(1);
  });

  it("appends before </head> when the tag does not already exist", () => {
    const out = upsertMetaTag(
      INDEX_HTML,
      "property",
      "og:url",
      "https://e.com/shops/a",
    );
    expect(countOccurrences(out, /property="og:url"/g)).toBe(1);
    expect(out.indexOf('property="og:url"')).toBeLessThan(
      out.indexOf("</head>"),
    );
  });

  it("escapes injected content so it cannot break out of the attribute", () => {
    const out = upsertMetaTag(
      INDEX_HTML,
      "name",
      "description",
      `" onload="alert(1)" x="`,
    );
    expect(out).toContain("&quot; onload=&quot;alert(1)&quot;");
    expect(out).not.toContain('onload="alert(1)"');
  });

  it("replaces the single existing <title>", () => {
    const out = setTitle(
      INDEX_HTML,
      "Test Bistro — Menu & Online Ordering | Gahezlak",
    );
    expect(countOccurrences(out, /<title>/g)).toBe(1);
    expect(out).toContain(
      "<title>Test Bistro — Menu &amp; Online Ordering | Gahezlak</title>",
    );
    // The old title text is gone from the <title> element (it legitimately
    // survives in og:title/twitter:title, which setTitle does not touch).
    expect(/<title>([\s\S]*?)<\/title>/.exec(out)![1]).not.toContain(
      "Digital Menus",
    );
  });

  it("adds a canonical link when none exists, and replaces it when one does", () => {
    const once = setCanonical(INDEX_HTML, "https://e.com/shops/a");
    expect(countOccurrences(once, /rel="canonical"/g)).toBe(1);
    const twice = setCanonical(once, "https://e.com/shops/b");
    expect(countOccurrences(twice, /rel="canonical"/g)).toBe(1);
    expect(twice).toContain('href="https://e.com/shops/b"');
  });
});

describe("setJsonLd", () => {
  it("emits exactly one ld+json block even when applied twice", () => {
    const once = setJsonLd(INDEX_HTML, { a: 1 });
    const twice = setJsonLd(once, { a: 2 });
    expect(countOccurrences(twice, /application\/ld\+json/g)).toBe(1);
    expect(twice).toContain('{"a":2}');
  });

  it("does not disturb the module script tag", () => {
    const out = setJsonLd(INDEX_HTML, { a: 1 });
    expect(out).toContain(
      '<script type="module" src="/src/main.tsx"></script>',
    );
  });
});

describe("injectShopSeo", () => {
  const tags = buildShopSeoTags(
    SHOP,
    "https://gahezlak.example/shops/Test%20Bistro",
  )!;
  const out = injectShopSeo(INDEX_HTML, tags);

  it("produces exactly one of every head tag it manages", () => {
    expect(countOccurrences(out, /<title>/g)).toBe(1);
    for (const attr of [
      /name="description"/g,
      /property="og:type"/g,
      /property="og:site_name"/g,
      /property="og:title"/g,
      /property="og:description"/g,
      /property="og:url"/g,
      /property="og:image"/g,
      /name="twitter:card"/g,
      /name="twitter:title"/g,
      /name="twitter:description"/g,
      /name="twitter:image"/g,
      /rel="canonical"/g,
      /application\/ld\+json/g,
    ]) {
      expect(countOccurrences(out, attr)).toBe(1);
    }
  });

  it("carries the shop's real data into the head", () => {
    expect(out).toContain(
      "<title>Test Bistro — Menu &amp; Online Ordering | Gahezlak",
    );
    expect(out).toContain(
      'property="og:image" content="https://i.ibb.co/abc/logo.png"',
    );
    expect(out).toContain(
      'property="og:url" content="https://gahezlak.example/shops/Test%20Bistro"',
    );
    expect(out).toContain('"@type":"Restaurant"');
    expect(out).toContain('"name":"Test Bistro"');
  });

  it("leaves the body and the app's module script intact", () => {
    expect(out).toContain('<div id="root"></div>');
    expect(out).toContain(
      '<script type="module" src="/src/main.tsx"></script>',
    );
  });

  it("keeps index.html's default og:image when the shop has no usable logo", () => {
    const noLogo = buildShopSeoTags(
      { name: "Solo" },
      "https://e.com/shops/Solo",
    )!;
    const html = injectShopSeo(INDEX_HTML, noLogo);
    expect(html).toContain('property="og:image" content="/Logo.png"');
    expect(html).toContain('name="twitter:card" content="summary"');
  });

  it("neutralises a malicious shop name in every context at once", () => {
    const evil = buildShopSeoTags(
      {
        name: `"><script>alert(1)</script>`,
        type: `</script><img src=x onerror=alert(2)>`,
        address: { city: "<b>", country: "&", street: "'" },
      },
      "https://e.com/shops/evil",
    )!;
    const html = injectShopSeo(INDEX_HTML, evil);

    // No new element of any kind was introduced: the only `<` characters that
    // survive as real markup are the tags that were already there. The
    // payloads are present only as escaped text, which the parser treats as
    // character data, never as an element.
    expect(countOccurrences(html, /<script/g)).toBe(2); // app module + ld+json
    expect(countOccurrences(html, /<img/g)).toBe(0);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x onerror=alert(2)>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(2)&gt;");

    // And the ld+json block is still parseable JSON.
    const jsonLd =
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
    expect(jsonLd).not.toBeNull();
    expect(() => JSON.parse(jsonLd![1])).not.toThrow();
  });

  it("is a no-op on markup with no <head>", () => {
    expect(injectShopSeo("<p>hi</p>", tags)).toBe("<p>hi</p>");
  });
});

describe("shopSlugFromPathname", () => {
  it("extracts the slug from a shop route and its subpaths", () => {
    expect(shopSlugFromPathname("/shops/Test%20Bistro")).toBe("Test Bistro");
    expect(shopSlugFromPathname("/shops/Test%20Bistro/menu")).toBe(
      "Test Bistro",
    );
    expect(shopSlugFromPathname("/shops/abc/cart")).toBe("abc");
    expect(shopSlugFromPathname("/shops/abc/")).toBe("abc");
  });

  it("returns null for anything that is not a shop page", () => {
    expect(shopSlugFromPathname("/")).toBeNull();
    expect(shopSlugFromPathname("/shops")).toBeNull();
    expect(shopSlugFromPathname("/shops/")).toBeNull();
    expect(shopSlugFromPathname("/dashboard/shops/abc")).toBeNull();
    expect(shopSlugFromPathname("/shops/%20%20")).toBeNull();
  });

  it("returns null rather than throwing on malformed percent-encoding", () => {
    expect(shopSlugFromPathname("/shops/%E0%A4%A")).toBeNull();
  });
});

describe("canonicalShopPath", () => {
  it("self-canonicalises the two indexable routes", () => {
    expect(canonicalShopPath("/shops/Test%20Bistro")).toBe(
      "/shops/Test%20Bistro",
    );
    expect(canonicalShopPath("/shops/Test%20Bistro/")).toBe(
      "/shops/Test%20Bistro",
    );
    expect(canonicalShopPath("/shops/Test%20Bistro/menu")).toBe(
      "/shops/Test%20Bistro/menu",
    );
  });

  it("points per-visitor subroutes back at the shop landing page", () => {
    for (const sub of ["cart", "saved", "track"]) {
      expect(canonicalShopPath(`/shops/abc/${sub}`)).toBe("/shops/abc");
    }
    expect(canonicalShopPath("/shops/abc/orders/checkout/270004")).toBe(
      "/shops/abc",
    );
    // Deeper paths under /menu aren't the menu page itself.
    expect(canonicalShopPath("/shops/abc/menu/extra")).toBe("/shops/abc");
  });

  it("leaves non-shop paths alone", () => {
    expect(canonicalShopPath("/")).toBe("/");
    expect(canonicalShopPath("/dashboard/menu")).toBe("/dashboard/menu");
  });
});

describe("absolutiseImageMeta", () => {
  const html = `<head>
    <meta property="og:image" content="/Logo.png" />
    <meta name="twitter:image" content="/Logo.png" />
  </head>`;

  it("makes root-relative og:image and twitter:image absolute", () => {
    const out = absolutiseImageMeta(html, "https://gahezlak.com");

    expect(out).toContain('content="https://gahezlak.com/Logo.png"');
    expect(out).not.toContain('content="/Logo.png"');
  });

  it("strips a trailing slash from the origin rather than doubling it", () => {
    const out = absolutiseImageMeta(html, "https://gahezlak.com/");

    expect(out).toContain('content="https://gahezlak.com/Logo.png"');
    expect(out).not.toContain("gahezlak.com//Logo.png");
  });

  it("leaves already-absolute URLs untouched", () => {
    const absolute = `<meta property="og:image" content="https://img.example.test/a.png" />`;

    expect(absolutiseImageMeta(absolute, "https://gahezlak.com")).toBe(
      absolute,
    );
  });

  it("leaves protocol-relative and data URIs untouched", () => {
    const other = `<meta property="og:image" content="//cdn.example.test/a.png" />
    <meta name="twitter:image" content="data:image/png;base64,AAAA" />`;

    expect(absolutiseImageMeta(other, "https://gahezlak.com")).toBe(other);
  });

  it("does not touch unrelated meta tags", () => {
    const other = `<meta name="description" content="/not-an-image" />`;

    expect(absolutiseImageMeta(other, "https://gahezlak.com")).toBe(other);
  });

  it("is a no-op when no origin is known", () => {
    expect(absolutiseImageMeta(html, "")).toBe(html);
  });
});
