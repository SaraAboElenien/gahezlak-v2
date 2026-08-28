import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import QRCode from "qrcode";
import {
  buildMenuUrl,
  generateMenuQRCodeBuffer,
} from "../../utils/qr-code-generator";

/**
 * QR-code generation.
 *
 * This is the product's headline feature — a diner scans the code on the
 * table and lands on the menu — and it used to fail in production in ways
 * that stayed invisible for weeks, both traceable to the old design: a QR
 * image was rendered once at shop-creation time, uploaded to imgbb, and the
 * returned URL stored on the shop forever.
 *
 *   1. The deployed shop's QR encoded `http://localhost:5173/...`, because
 *      the URL was baked in at *creation* time from FRONTEND_URL, and the
 *      code was generated while that env var still held the dev value.
 *      Nothing ever re-checked it afterwards.
 *   2. imgbb started refusing requests from the deployed host's datacenter IP
 *      range entirely, which meant no new shop could be created at all.
 *
 * `generateMenuQRCodeBuffer` (which replaced the old
 * `generateAndUploadMenuQRCode`) exists to make both classes of bug
 * structurally impossible rather than fixing one instance: it does no
 * network call, stores nothing, and reads `FRONTEND_URL` at *call* time, so
 * the regression test below — that the same shop name encodes a different
 * URL once FRONTEND_URL changes — is the one that matters most here.
 */

const ENV_KEYS = ["FRONTEND_URL"] as const;
const original: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) original[k] = process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});

describe("buildMenuUrl", () => {
  it("builds the menu URL from an explicit base URL", () => {
    const menuUrl = buildMenuUrl("Fauget", "https://gahezlak-web.onrender.com");

    expect(menuUrl).toBe("https://gahezlak-web.onrender.com/shops/Fauget/menu");
  });

  it("falls back to FRONTEND_URL when no base URL is passed", () => {
    process.env.FRONTEND_URL = "https://gahezlak-web.onrender.com";

    expect(buildMenuUrl("Fauget")).toBe(
      "https://gahezlak-web.onrender.com/shops/Fauget/menu",
    );
  });

  it("percent-encodes the shop name so punctuation cannot truncate the URL", () => {
    // `/shops/:slug/menu` is declared in frontend/src/Layout.tsx. A QR
    // pointing at any other shape resolves to a 404 for every diner who scans
    // it, which is not observable from the backend at all. "#" is the
    // dangerous case: unencoded it turns the rest of the path into a
    // fragment.
    const menuUrl = buildMenuUrl("Joe's Diner #2", "https://example.test");

    expect(menuUrl).toBe(
      "https://example.test/shops/Joe's%20Diner%20%232/menu",
    );
    // The round trip a scanner + the SPA router actually performs.
    expect(decodeURIComponent(new URL(menuUrl).pathname)).toBe(
      "/shops/Joe's Diner #2/menu",
    );
  });

  /**
   * THE regression this whole change exists to prevent: the old code path
   * read FRONTEND_URL exactly once, at shop-creation time, and then stored
   * the rendered image's address — so a later change to FRONTEND_URL (or a
   * redeploy pointing at a different origin) was invisible forever, which is
   * exactly what happened to the one real deployed shop. Generating on
   * demand only fixes that if the env var really is read fresh on every
   * call, not memoized anywhere — this is the test that would fail if
   * someone "optimized" that away.
   */
  it("reflects the CURRENT FRONTEND_URL rather than a value captured earlier", () => {
    process.env.FRONTEND_URL = "http://localhost:5173";
    const stale = buildMenuUrl("Fauget");
    expect(stale).toBe("http://localhost:5173/shops/Fauget/menu");

    // The origin changes — e.g. a deploy to the real host — with no code
    // change and no restart.
    process.env.FRONTEND_URL = "https://gahezlak-web.onrender.com";
    const fresh = buildMenuUrl("Fauget");

    expect(fresh).toBe("https://gahezlak-web.onrender.com/shops/Fauget/menu");
    expect(fresh).not.toBe(stale);
  });
});

describe("generateMenuQRCodeBuffer", () => {
  it("returns a real PNG buffer and the menu URL it encodes", async () => {
    process.env.FRONTEND_URL = "https://example.test";

    const { buffer, menuUrl } = await generateMenuQRCodeBuffer("Fauget");

    expect(menuUrl).toBe("https://example.test/shops/Fauget/menu");
    expect(Buffer.isBuffer(buffer)).toBe(true);
    // PNG magic number: 0x89 'P' 'N' 'G' '\r' '\n' 0x1A '\n'.
    expect(buffer.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });

  it("makes no network call — it is a pure local render", async () => {
    // The bug this exists to eliminate: imgbb blocking the deployed host.
    // There is nothing left in this function that could reproduce it.
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await generateMenuQRCodeBuffer("Fauget", "https://example.test");

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("produces bytes identical to encoding the same URL directly with the qrcode library", async () => {
    // Rather than trying to decode the PNG back into text (awkward, and not
    // what production code needs to be correct), this compares against the
    // same library used the same way — the most direct way to pin "the right
    // URL was actually encoded" without reimplementing a QR decoder.
    const { buffer, menuUrl } = await generateMenuQRCodeBuffer(
      "Fauget",
      "https://example.test",
    );
    const expected = await QRCode.toBuffer(menuUrl, {
      width: 300,
      margin: 2,
      color: { dark: "#000000", light: "#FFFFFF" },
      errorCorrectionLevel: "M",
    });

    expect(buffer).toEqual(expected);
  });

  it("respects caller-supplied rendering options", async () => {
    const { buffer } = await generateMenuQRCodeBuffer(
      "Fauget",
      "https://example.test",
      { width: 500, errorCorrectionLevel: "H" },
    );
    const expected = await QRCode.toBuffer(
      "https://example.test/shops/Fauget/menu",
      {
        width: 500,
        margin: 2,
        color: { dark: "#000000", light: "#FFFFFF" },
        errorCorrectionLevel: "H",
      },
    );

    expect(buffer).toEqual(expected);
  });
});
