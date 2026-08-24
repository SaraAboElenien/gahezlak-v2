import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import uploadToImgbb from "../../utils/upload-to-imgbb";
import { Errors } from "../../errors";
import { logger } from "../../config/pino";

/**
 * The imgbb upload path, and specifically its failure reporting.
 *
 * Why this file exists: on 2026-08-24 `POST /shops/qr-code` returned a bare
 * `500 Internal server error` on the live API while the identical code path
 * succeeded locally against the same database and the same key. Nothing in the
 * response, and nothing in the log, distinguished a bad key from a network
 * failure from imgbb answering with something that was not JSON — so the only
 * available next step was guesswork.
 *
 * The mechanism behind that opacity is worth stating, because it is what these
 * tests actually protect. `qr-code-generator.ts` rethrows a `CustomError`
 * untouched but wraps ANY other error in a bare `Error`, which the global
 * handler flattens to a status-less 500. So every failure here must (a) throw a
 * CustomError, or it becomes undiagnosable from outside, and (b) log the
 * evidence, or it becomes undiagnosable from inside. Both halves are asserted
 * below, per failure mode.
 *
 * The uncaught case that caused the incident was `await response.json()` on a
 * 2xx whose body is HTML — exactly what a proxy or WAF serving an interstitial
 * to a datacenter IP produces, which is why it reproduced only in production.
 */

const KEY = "IMGBB_KEY";
let originalKey: string | undefined;
let errorSpy: ReturnType<typeof vi.spyOn>;

const file = { buffer: Buffer.from("fake-png-bytes") } as Express.Multer.File;

/** Minimal Response stand-in: only what the function actually reads. */
function res(opts: {
  ok: boolean;
  status: number;
  body: string;
  contentType?: string;
}): Response {
  return {
    ok: opts.ok,
    status: opts.status,
    headers: {
      get: (h: string) =>
        h === "content-type" ? (opts.contentType ?? null) : null,
    },
    text: async () => opts.body,
  } as unknown as Response;
}

const loggedPayloads = () =>
  errorSpy.mock.calls.map(
    (c) => JSON.stringify(c[0] ?? "") + " " + String(c[1] ?? ""),
  );
const loggedText = () => loggedPayloads().join("\n");

beforeEach(() => {
  originalKey = process.env[KEY];
  process.env[KEY] = "test-key";
  errorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
});

afterEach(() => {
  if (originalKey === undefined) delete process.env[KEY];
  else process.env[KEY] = originalKey;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("uploadToImgbb", () => {
  it("returns the parsed payload when imgbb succeeds", async () => {
    const payload = {
      success: true,
      status: 200,
      data: { id: "abc", url: "https://i.ibb.co/abc/qr.png" },
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          res({ ok: true, status: 200, body: JSON.stringify(payload) }),
        ),
    );

    await expect(uploadToImgbb(file)).resolves.toEqual(payload);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("refuses without an API key, and does not call imgbb at all", async () => {
    delete process.env[KEY];
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    // Interpolating an unset key would send the literal string "undefined".
    await expect(uploadToImgbb(file)).rejects.toBeInstanceOf(
      Errors.BadRequestError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(loggedText()).toContain("IMGBB_KEY");
  });

  it("reports a non-OK response with its status and body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        res({
          ok: false,
          status: 400,
          body: '{"error":{"message":"Invalid API v1 key"}}',
        }),
      ),
    );

    await expect(uploadToImgbb(file)).rejects.toBeInstanceOf(
      Errors.BadRequestError,
    );
    const text = loggedText();
    expect(text).toContain("400");
    // The body is the only thing that names the actual cause.
    expect(text).toContain("Invalid API v1 key");
  });

  /**
   * The production incident, reproduced. A 2xx carrying HTML used to reach
   * `response.json()`, throw a SyntaxError, and surface as a blank 500.
   */
  it("reports a 2xx whose body is not JSON, instead of throwing a raw SyntaxError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        res({
          ok: true,
          status: 200,
          contentType: "text/html",
          body: "<!doctype html><html><body>Attention Required! Cloudflare</body></html>",
        }),
      ),
    );

    const err = await uploadToImgbb(file).catch((e) => e);

    // A SyntaxError here is the bug: it is not a CustomError, so the generator
    // wraps it and the client gets a status-less 500.
    expect(err).toBeInstanceOf(Errors.BadRequestError);
    expect(err).not.toBeInstanceOf(SyntaxError);
    const text = loggedText();
    expect(text).toContain("text/html");
    expect(text).toContain("Cloudflare");
  });

  it("reports a network-level failure, where there is no response at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValue(new Error("getaddrinfo ENOTFOUND api.imgbb.com")),
    );

    await expect(uploadToImgbb(file)).rejects.toBeInstanceOf(
      Errors.BadRequestError,
    );
    expect(loggedText()).toContain("network level");
  });

  it("distinguishes a timeout from other network failures", async () => {
    const timeout = new Error("The operation was aborted due to timeout");
    timeout.name = "TimeoutError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeout));

    await expect(uploadToImgbb(file)).rejects.toBeInstanceOf(
      Errors.BadRequestError,
    );
    // "slow" and "never" are different operational problems with different fixes.
    expect(loggedText()).toContain("timed out");
  });

  it("refuses a 2xx that carries no image URL rather than returning undefined", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        res({
          ok: true,
          status: 200,
          body: JSON.stringify({ success: false, status: 200 }),
        }),
      ),
    );

    // Callers write `data.url` straight onto the shop, so letting this through
    // stores `undefined` and defers the failure to whenever someone looks.
    await expect(uploadToImgbb(file)).rejects.toBeInstanceOf(
      Errors.BadRequestError,
    );
    expect(loggedText()).toContain("no image URL");
  });

  it("passes an abort signal, so a hung upload cannot hold the request open", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      res({
        ok: true,
        status: 200,
        body: JSON.stringify({
          success: true,
          status: 200,
          data: { id: "a", url: "u" },
        }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await uploadToImgbb(file);

    const init = fetchMock.mock.calls[0][1];
    expect(init.signal).toBeDefined();
  });
});
