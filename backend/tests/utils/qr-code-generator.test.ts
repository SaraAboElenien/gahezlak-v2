import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * QR-code generation, and the error handling around it.
 *
 * This is the product's headline feature — a diner scans the code on the table
 * and lands on the menu — and it has failed in production in two distinct ways
 * that both stayed invisible for weeks:
 *
 *   1. The deployed shop's QR encoded `http://localhost:5173/...`, because the
 *      URL is baked in at *creation* time from FRONTEND_URL and the code was
 *      generated while that still held the dev value. Nothing re-checks it
 *      afterwards, so a stale code looks perfectly healthy from the outside.
 *
 *   2. `POST /shops/qr-code` answered a blank 500 on the live API while the
 *      identical code path succeeded locally against the same database. The
 *      cause was environmental (an unset IMGBB_KEY), but it was undiagnosable
 *      from the response, because the generator caught every error and rethrew
 *      it as a bare `Error` — discarding the typed BadRequestError that carried
 *      the real status and message.
 *
 * So these tests pin the error *types*, not just the happy path: the value of
 * a typed error here is that it survives the catch and reaches the client as
 * something other than "Internal server error".
 */

const uploadToImgbbMock = vi.hoisted(() => vi.fn());

vi.mock("../../utils/upload-to-imgbb", () => ({
  default: uploadToImgbbMock,
}));

const ENV_KEYS = ["FRONTEND_URL", "IMGBB_KEY"] as const;
const original: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) original[k] = process.env[k];
  vi.clearAllMocks();
  vi.resetModules();
  uploadToImgbbMock.mockResolvedValue({
    success: true,
    status: 200,
    data: { id: "abc", url: "https://i.ibb.co/abc/qr.png" },
  });
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});

async function importGenerator() {
  return (await import("../../utils/qr-code-generator"))
    .generateAndUploadMenuQRCode;
}

describe("generateAndUploadMenuQRCode", () => {
  it("encodes the menu URL from the base URL it is given", async () => {
    const generate = await importGenerator();

    const { menuUrl, qrCodeUrl } = await generate(
      "Fauget",
      "https://gahezlak-web.onrender.com",
    );

    expect(menuUrl).toBe("https://gahezlak-web.onrender.com/shops/Fauget/menu");
    expect(qrCodeUrl).toBe("https://i.ibb.co/abc/qr.png");
  });

  it("falls back to FRONTEND_URL when no base URL is passed", async () => {
    // This is the bug-1 surface above: the caller in shop.service.ts passes
    // `undefined`, so whatever FRONTEND_URL holds at that moment is what gets
    // permanently baked into the image.
    process.env.FRONTEND_URL = "https://gahezlak-web.onrender.com";
    const generate = await importGenerator();

    const { menuUrl } = await generate("Fauget");

    expect(menuUrl).toBe("https://gahezlak-web.onrender.com/shops/Fauget/menu");
  });

  it("percent-encodes the shop name so punctuation cannot truncate the URL", async () => {
    // `/shops/:slug/menu` is declared in frontend/src/Layout.tsx. A QR pointing
    // at any other shape resolves to a 404 for every diner who scans it, which
    // is not observable from the backend at all. "#" is the dangerous case:
    // unencoded it turns the rest of the path into a fragment.
    process.env.FRONTEND_URL = "https://example.test";
    const generate = await importGenerator();

    const { menuUrl } = await generate("Joe's Diner #2");

    expect(menuUrl).toBe(
      "https://example.test/shops/Joe's%20Diner%20%232/menu",
    );
    // The round trip a scanner + the SPA router actually performs.
    expect(decodeURIComponent(new URL(menuUrl).pathname)).toBe(
      "/shops/Joe's Diner #2/menu",
    );
  });

  it("preserves a typed upload error instead of flattening it to a 500", async () => {
    // The regression that made the production failure opaque. If this starts
    // failing, the endpoint has gone back to answering a blank "Internal server
    // error" for causes it can actually name.
    //
    // The error class is imported from the SAME module registry the generator
    // sees. vi.resetModules() gives each dynamic import a fresh copy of
    // ../../errors, so a class captured at the top of this file is a different
    // object than the one the generator checks against and `instanceof` fails
    // for reasons that have nothing to do with the behaviour under test.
    const { Errors: freshErrors } = await import("../../errors");
    uploadToImgbbMock.mockRejectedValue(
      new freshErrors.BadRequestError("IMAGE_UPLOAD_FAILED"),
    );
    const generate = await importGenerator();

    const err = await generate("Fauget", "https://example.test").catch(
      (e) => e,
    );

    expect(err).toBeInstanceOf(freshErrors.CustomError);
    expect(err.statusCode).toBe(400);
  });

  it("still wraps genuinely unknown errors with context", async () => {
    uploadToImgbbMock.mockRejectedValue(new Error("socket hang up"));
    const generate = await importGenerator();

    await expect(generate("Fauget", "https://example.test")).rejects.toThrow(
      /Failed to generate and upload QR code: socket hang up/,
    );
  });

  it("rejects a 2xx upload that returned no hosted URL", async () => {
    // Otherwise the shop is saved with `qrCodeUrl: undefined` and the problem
    // surfaces much later as a broken image in the dashboard.
    uploadToImgbbMock.mockResolvedValue({ success: true, status: 200 });
    const generate = await importGenerator();

    await expect(generate("Fauget", "https://example.test")).rejects.toThrow(
      /returned no image URL/,
    );
  });
});

describe("uploadToImgbb", () => {
  it("fails with a typed error, and never calls imgbb, when IMGBB_KEY is unset", async () => {
    // The actual production cause. Without the guard the key interpolates as
    // the string "undefined", imgbb answers 400 "Invalid API v1 key", and the
    // failure reads as a bad image rather than a missing deployment variable.
    vi.doUnmock("../../utils/upload-to-imgbb");
    vi.resetModules();
    delete process.env.IMGBB_KEY;

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const uploadToImgbb = (await import("../../utils/upload-to-imgbb")).default;
    // Same module-registry caveat as above.
    const { Errors: freshErrors } = await import("../../errors");

    const err = await uploadToImgbb({
      buffer: Buffer.from("x"),
    } as Express.Multer.File).catch((e) => e);

    expect(err).toBeInstanceOf(freshErrors.BadRequestError);
    expect(err.statusCode).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});
