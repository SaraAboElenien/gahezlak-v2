/**
 * Guard against the "raw translation key on screen" bug class, which has now
 * shipped twice for the same underlying reason: a component calls
 * `t("some.key")`, the key does not exist in one or both locale bundles, and
 * nothing catches it until a human sees either the literal key string (no
 * `defaultValue`) or permanent English in the Arabic UI (a `defaultValue`
 * masking a missing `ar.json` entry — see `MenuEnrichSection.tsx`, fixed in
 * the same change that added this test).
 *
 * This statically scans every `.ts`/`.tsx` file under `src/` for `t("literal
 * key")` call sites and asserts each literal key resolves, as a real string,
 * in both `en.json` and `ar.json`.
 *
 * Deliberate scope limits:
 *
 * - Only string-literal keys (single or double quoted) are checked. A
 *   template-literal or variable key (`` t(`item.${id}`) ``, `t(dynamicKey)`)
 *   is not statically knowable and is silently skipped rather than flagged —
 *   scanning those would either need real interpolation values (which the
 *   test doesn't have) or produce false failures on legitimately dynamic
 *   keys. If a dynamic key is wrong, only runtime/E2E coverage can catch it.
 * - A key with a `defaultValue` option is still required to resolve in BOTH
 *   locale files, not just `en.json`. `defaultValue` exists to keep the UI
 *   from ever showing a raw key, which is exactly what let the
 *   `MenuEnrichSection` bug hide for as long as it did: the English text
 *   looked intentional, so nobody noticed Arabic was never wired up. Treating
 *   a `defaultValue` as "good enough" would let that exact bug back in, so
 *   this test fails on it rather than warning.
 * - Matches inside a `//` line comment, a `/* ... *\/` block comment, or a
 *   JSX `{/* ... *\/}` comment are skipped — illustrative or disabled code in
 *   a comment isn't a real call site. (`AdminReports.tsx` has exactly this:
 *   a commented-out `<th>{t("adminReports.email")}</th>`, which would
 *   otherwise misreport that file as the call site for a key that is really
 *   only referenced, live, from `ReportModal.tsx`.)
 */
import fs from "node:fs";
import path from "node:path";
import i18next from "i18next";
import { describe, expect, it } from "vitest";
import enTranslations from "@/locales/en.json";
import arTranslations from "@/locales/ar.json";

const SRC_DIR = path.resolve(__dirname, "..");

/**
 * A dedicated i18next instance (not the app's shared singleton from
 * `@/libs/i18n`, which `src/tests/setup.ts` already initialises and other
 * tests mutate the language of) purely to resolve keys the same way the real
 * app does.
 *
 * This matters more than it looks: a few real keys in this codebase contain
 * literal dots in their flat, top-level name (e.g. `"Search categories..."`),
 * which collide with i18next's `.`-based nesting separator. A hand-rolled
 * `key.split(".")` path walker resolves those wrong and reports a false
 * failure. `getResource` runs i18next's actual lookup algorithm — which
 * tries the full remaining string as a flat key before descending further —
 * so it agrees with what a rendered component would actually show.
 */
const testI18n = i18next.createInstance();
testI18n.init({
  resources: {
    en: { translation: enTranslations },
    ar: { translation: arTranslations },
  },
  lng: "en",
  // No fallback between en/ar here: each language must resolve the key on
  // its own, or a missing ar.json entry would silently pass by falling back
  // to English — exactly the bug this test exists to catch.
  fallbackLng: false,
  interpolation: { escapeValue: false },
});

/**
 * Resolves `key` in `lng`, returning the string if (and only if) it is a real
 * leaf translation. `getResource` also returns non-string nodes (an object,
 * if `key` names a whole nested section rather than a leaf) and `undefined`
 * for anything unresolved; both are treated as "not resolved" here.
 */
function resolveKey(key: string, lng: "en" | "ar"): string | undefined {
  const value = testI18n.getResource(lng, "translation", key) as unknown;
  return typeof value === "string" ? value : undefined;
}

/** Matches `t("some.key"` / `t('some.key'` — not `t(\`template\`` or `t(variable)`. */
const T_CALL_RE = /(?<![A-Za-z0-9_])t\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;

interface CallSite {
  file: string;
  key: string;
}

function listSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true, recursive: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry.name)) continue; // tests don't call t() with real app keys
    // `withFileTypes + recursive` gives `entry.parentPath` (Node 20+) / `entry.path` as the dir.
    const parentDir =
      (entry as unknown as { parentPath?: string; path?: string }).parentPath ??
      (entry as unknown as { path: string }).path;
    files.push(path.join(parentDir, entry.name));
  }
  return files;
}

/**
 * Blanks out `/* ... *\/` block comments (JSX `{/* ... *\/}` comments included
 * — they are still just a block comment once you ignore the braces),
 * preserving length and newlines so line-based comment detection below still
 * lines up.
 */
function stripBlockComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (block) =>
    block.replace(/[^\n]/g, " "),
  );
}

function findCallSites(): CallSite[] {
  const sites: CallSite[] = [];
  for (const file of listSourceFiles(SRC_DIR)) {
    const text = stripBlockComments(fs.readFileSync(file, "utf8"));
    for (const match of text.matchAll(T_CALL_RE)) {
      const key = match[2];
      const matchIndex = match.index ?? 0;
      const lineStart = text.lastIndexOf("\n", matchIndex) + 1;
      const beforeMatchOnLine = text.slice(lineStart, matchIndex).trim();
      if (beforeMatchOnLine.startsWith("//")) continue; // commented-out call
      sites.push({ file: path.relative(SRC_DIR, file), key });
    }
  }
  return sites;
}

const callSites = findCallSites();

// Dedupe (file, key) pairs so a key referenced multiple times in one file
// (e.g. loading vs. error branches) only produces one failure.
const uniqueSites = Array.from(
  new Map(
    callSites.map((site) => [`${site.file}::${site.key}`, site]),
  ).values(),
);

describe("i18n key coverage", () => {
  it("found at least one t() call site to check (sanity check for the scanner itself)", () => {
    // If this ever fails, the scanner regex or the recursive readdir broke,
    // not that the app stopped using translations.
    expect(callSites.length).toBeGreaterThan(50);
  });

  it.each(uniqueSites)(
    'resolves "$key" (referenced in $file) in en.json',
    ({ file, key }) => {
      const resolved = resolveKey(key, "en");
      expect(
        resolved,
        `Missing en.json key "${key}", referenced in ${file}`,
      ).toBeTypeOf("string");
    },
  );

  it.each(uniqueSites)(
    'resolves "$key" (referenced in $file) in ar.json',
    ({ file, key }) => {
      const resolved = resolveKey(key, "ar");
      expect(
        resolved,
        `Missing ar.json key "${key}", referenced in ${file}. ` +
          "If the call site supplies a defaultValue, that does NOT count: " +
          "an English defaultValue silently defeats Arabic localization " +
          "(this is the exact MenuEnrichSection bug this test guards against).",
      ).toBeTypeOf("string");
    },
  );
});
