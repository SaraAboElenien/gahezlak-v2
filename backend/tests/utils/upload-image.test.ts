import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import uploadImage, { sign } from "../../utils/upload-image";
import { Errors } from "../../errors";
import { logger } from "../../config/pino";

/**
 * Image hosting, and specifically its failure reporting.
 *
 * Context: images were hosted on imgbb until 2026-08-24, when it was found to
 * reject every request from the deployed host with
 * `{"error":{"message":"You have been forbidden to use this website.","code":103}}`
 * — it blocks datacenter ranges, so the identical key worked from a laptop and
 * failed on Render. That broke shop creation, logo changes and menu-item
 * images on the live site for anyone who tried to sign up.
 *
 * It stayed invisible for weeks because the failure surfaced as a blank
 * `500 Internal server error` with nothing logged: `qr-code-generator.ts`
 * wrapped any non-CustomError in a bare `Error`, which the global handler
 * flattens to a status-less 500. So each failure mode below pins two
 * properties — that a CustomError is thrown, or it is undiagnosable from
 * outside, AND that the evidence is logged, or it is undiagnosable from inside.
 */

const ENV = [
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
] as const;

const saved: Record<string, string | undefined> = {};
let errorSpy: ReturnType<typeof vi.spyOn>;

const file = {
  buffer: Buffer.from("fake-png-bytes"),
  mimetype: "image/png",
} as Express.Multer.File;

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

const logged = () =>
  errorSpy.mock.calls
    .map(
      (c: unknown[]) => JSON.stringify(c[0] ?? "") + " " + String(c[1] ?? ""),
    )
    .join("\n");

beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k];
  process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
  process.env.CLOUDINARY_API_KEY = "test-key";
  process.env.CLOUDINARY_API_SECRET = "test-secret";
  errorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/**
 * Cloudinary rejects a wrong signature with a 401 that reads like bad
 * credentials, so an error here is expensive to diagnose and easy to
 * misattribute. These two vectors are Cloudinary's own published examples,
 * kept as fixed points rather than as values computed by this same code.
 */
describe("sign", () => {
  it("matches the documented single-parameter vector", () => {
    expect(sign({ timestamp: "1315060510" }, "abcd")).toBe(
      "a21ad0f63beb4de2e5575204b79ab90bffb02c10",
    );
  });

  it("matches the documented multi-parameter vector", () => {
    expect(
      sign(
        {
          public_id: "sample_image",
          timestamp: "1315060510",
          eager: "w_400,h_300,c_pad|w_260,h_200,c_crop",
        },
        "abcd",
      ),
    ).toBe("bfd09f95f331f558cbd1320e67aa8d488770583e");
  });

  it("sorts parameters, so insertion order cannot change the result", () => {
    expect(sign({ b: "2", a: "1" }, "s")).toBe(sign({ a: "1", b: "2" }, "s"));
  });
});

describe("uploadImage", () => {
  const okBody = JSON.stringify({
    secure_url: "https://res.cloudinary.com/test-cloud/image/upload/v1/x.png",
    url: "http://res.cloudinary.com/test-cloud/image/upload/v1/x.png",
    public_id: "gahezlak/x",
  });

  it("returns the delivery URL and public id on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(res({ ok: true, status: 200, body: okBody })),
    );

    await expect(uploadImage(file)).resolves.toEqual({
      url: "https://res.cloudinary.com/test-cloud/image/upload/v1/x.png",
      publicId: "gahezlak/x",
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("returns the https URL, never the http one", async () => {
    // The frontend is served over HTTPS and its CSP forbids mixed content, so
    // an http image is blocked by the browser and reads as a broken upload.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(res({ ok: true, status: 200, body: okBody })),
    );

    const result = await uploadImage(file);
    expect(result.url.startsWith("https://")).toBe(true);
  });

  it("signs only the permitted parameters", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(res({ ok: true, status: 200, body: okBody }));
    vi.stubGlobal("fetch", fetchMock);

    await uploadImage(file);

    const form = fetchMock.mock.calls[0][1].body as FormData;
    // `file` and `api_key` are excluded from the signature by Cloudinary's
    // spec; including either produces a signature it rejects as invalid.
    expect(form.get("signature")).toBe(
      sign(
        { folder: "gahezlak", timestamp: form.get("timestamp") as string },
        "test-secret",
      ),
    );
  });

  it("refuses when credentials are absent, naming which are missing", async () => {
    delete process.env.CLOUDINARY_API_SECRET;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadImage(file)).rejects.toBeInstanceOf(
      Errors.BadRequestError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logged()).toContain("CLOUDINARY_API_SECRET");
  });

  it("reports a non-OK response with its status and body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        res({
          ok: false,
          status: 401,
          body: '{"error":{"message":"Invalid Signature"}}',
        }),
      ),
    );

    await expect(uploadImage(file)).rejects.toBeInstanceOf(
      Errors.BadRequestError,
    );
    const text = logged();
    expect(text).toContain("401");
    expect(text).toContain("Invalid Signature");
  });

  it("reports a 2xx whose body is not JSON, rather than throwing a SyntaxError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        res({
          ok: true,
          status: 200,
          contentType: "text/html",
          body: "<!doctype html><html><body>Attention Required!</body></html>",
        }),
      ),
    );

    const err = await uploadImage(file).catch((e) => e);
    expect(err).toBeInstanceOf(Errors.BadRequestError);
    expect(err).not.toBeInstanceOf(SyntaxError);
    expect(logged()).toContain("text/html");
  });

  it("reports a network-level failure, where no response exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND")),
    );

    await expect(uploadImage(file)).rejects.toBeInstanceOf(
      Errors.BadRequestError,
    );
    expect(logged()).toContain("network level");
  });

  it("distinguishes a timeout from other network failures", async () => {
    // "slow" and "never" are different operational problems with different fixes.
    const timeout = new Error("aborted");
    timeout.name = "TimeoutError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeout));

    await expect(uploadImage(file)).rejects.toBeInstanceOf(
      Errors.BadRequestError,
    );
    expect(logged()).toContain("timed out");
  });

  it("refuses a 2xx carrying no URL rather than storing undefined", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          res({ ok: true, status: 200, body: JSON.stringify({ ok: true }) }),
        ),
    );

    await expect(uploadImage(file)).rejects.toBeInstanceOf(
      Errors.BadRequestError,
    );
    expect(logged()).toContain("no image URL");
  });
});
