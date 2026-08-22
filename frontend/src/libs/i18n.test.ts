/**
 * The language preference has to survive a full page load.
 *
 * `useLang.changeLanguage` used to swap i18next's in-memory language and set
 * the two document attributes, and stop there — so the choice lived exactly as
 * long as the document. A refresh, a shared link, or a scanned QR code put an
 * Arabic-reading customer back into an English, left-to-right interface. The
 * end-to-end suite covers the journey (switch, navigate, still Arabic); these
 * tests cover the parts of the mechanism a browser journey cannot reach — a
 * corrupted stored value, and storage that throws on access.
 *
 * `libs/i18n` reads storage once at module import to decide the initial
 * language, so every case here has to seed storage and then re-import the
 * module with a fresh registry. That is what `vi.resetModules()` plus a
 * dynamic `import()` is doing below; a top-level import would bind whatever
 * the shared test setup already initialised.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "gahezlak.lang";

async function importFreshI18n() {
  vi.resetModules();
  return import("./i18n");
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("dir");
  document.documentElement.removeAttribute("lang");
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("language persistence", () => {
  it("defaults to English, and still sets an explicit direction", async () => {
    const { readStoredLanguage } = await importFreshI18n();

    expect(readStoredLanguage()).toBeNull();
    // `index.html` ships `lang="en"` and no `dir` at all. The stylesheet's
    // direction-scoped rules need something to match even in the default case,
    // which is why `applyDocumentLanguage` runs unconditionally at import.
    expect(document.documentElement.dir).toBe("ltr");
    expect(document.documentElement.lang).toBe("en");
  });

  /**
   * Note what this asserts and what it cannot.
   *
   * `i18next` is a singleton imported from node_modules, which Vitest
   * externalises — so `vi.resetModules()` resets *this* module but hands the
   * re-import the same, already-initialised i18next that `src/tests/setup.ts`
   * created. The `if (!i18n.isInitialized)` guard then skips `init`, and
   * `i18n.language` still reads "en" no matter what was stored. That is an
   * artefact of re-importing inside one process, not the behaviour of a real
   * page load, where the process starts empty.
   *
   * So the assertions here are on the half this module owns outright and
   * applies unconditionally: the stored value is read, validated, and written
   * to the document. The i18next side — that the restored language actually
   * changes the rendered strings — is covered where it can be observed
   * honestly, in `e2e/specs/i18n.spec.ts` against a real browser.
   */
  it("restores a stored Arabic preference at boot, layout included", async () => {
    window.localStorage.setItem(STORAGE_KEY, "ar");

    const { readStoredLanguage } = await importFreshI18n();

    expect(readStoredLanguage()).toBe("ar");
    // The regression this file exists for: translating the strings without
    // restoring `dir` would leave the page mirrored the wrong way, which reads
    // as a styling glitch rather than a broken preference.
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang).toBe("ar");
  });

  it("ignores a stored value that is not a language we ship", async () => {
    // Anyone can write anything into localStorage, and a stale key from an
    // older build is the realistic version of this. Passing it to i18next
    // would select a resource bundle that does not exist and render every
    // string as its own key — the same failure mode as the missing
    // `cancelOrder` translation.
    window.localStorage.setItem(STORAGE_KEY, "fr");

    const { readStoredLanguage } = await importFreshI18n();

    expect(readStoredLanguage()).toBeNull();
    expect(document.documentElement.dir).toBe("ltr");
    expect(document.documentElement.lang).toBe("en");
  });

  it("still boots when localStorage throws on read", async () => {
    // Safari private browsing and "block site data" make this throw rather
    // than return null. This code runs at module import, before React mounts,
    // so an unhandled exception here blanks the entire app to save a
    // preference.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError: storage is disabled");
    });

    const { readStoredLanguage } = await importFreshI18n();

    expect(readStoredLanguage()).toBeNull();
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("still applies a language change when localStorage throws on write", async () => {
    const { applyDocumentLanguage, storeLanguage } = await importFreshI18n();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    // The preference degrades to the old behaviour — it applies now and does
    // not outlive the document — rather than failing the switch outright.
    expect(() => storeLanguage("ar")).not.toThrow();
    applyDocumentLanguage("ar");
    expect(document.documentElement.dir).toBe("rtl");
  });

  it("round-trips a stored choice through storeLanguage", async () => {
    const { storeLanguage, readStoredLanguage } = await importFreshI18n();

    storeLanguage("ar");

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("ar");
    expect(readStoredLanguage()).toBe("ar");
  });
});
