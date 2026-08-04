import { describe, it, expect, beforeEach, vi } from "vitest";
import sharp from "sharp";

/**
 * Coverage for menu OCR.
 *
 * `sharp` is deliberately NOT mocked — the fixtures below are real encoded
 * images, so the resize/re-encode path is genuinely exercised. Only the Claude
 * call is mocked; what's asserted is everything around it: what gets sent, how
 * the reply is parsed, and how each failure mode is reported.
 *
 * The failure modes matter more than the happy path here. The previous
 * implementation scraped JSON out of a markdown fence with a regex and pushed
 * every failure into `warnings` while returning an empty item list — so a
 * total extraction failure was indistinguishable to the caller from a photo
 * that genuinely had no menu in it.
 */

const createMock = vi.hoisted(() => vi.fn());

vi.mock("../../config/claude", () => ({
  getClaudeClient: () => ({ messages: { create: createMock } }),
  aiEnabled: () => true,
  AI_CONFIG: { MODEL: "claude-opus-5", MAX_TOKENS: 8000 },
}));

/** A real JPEG of the given size — not a stub buffer. */
async function makeImage(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .jpeg()
    .toBuffer();
}

function mockExtraction(items: unknown[]) {
  createMock.mockResolvedValue({
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify({ items }) }],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("extractMenuFromFile — happy path", () => {
  it("returns the items the model found", async () => {
    const { extractMenuFromFile } =
      await import("../../services/ai/menu-extract.service");
    mockExtraction([
      { category: "Mains", name: "Grilled Chicken", price: 120 },
      { name: "Lentil Soup", description: "Warm and hearty", price: 45 },
    ]);

    const result = await extractMenuFromFile(
      await makeImage(800, 600),
      "image/jpeg",
    );

    expect(result.errors).toEqual([]);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].name).toBe("Grilled Chicken");
    expect(result.items[1].price).toBe(45);
  });

  it("constrains the reply with a schema instead of parsing prose", async () => {
    const { extractMenuFromFile } =
      await import("../../services/ai/menu-extract.service");
    mockExtraction([{ name: "Falafel", price: 30 }]);

    await extractMenuFromFile(await makeImage(400, 400), "image/jpeg");

    // The fix for the old regex-over-markdown parsing: without this the model
    // is free to wrap JSON in prose and the extraction becomes best-effort.
    const request = createMock.mock.calls[0][0];
    expect(request.output_config.format.type).toBe("json_schema");
    expect(request.model).toBe("claude-opus-5");
  });

  it("sends the image as a base64 block with a declared media type", async () => {
    const { extractMenuFromFile } =
      await import("../../services/ai/menu-extract.service");
    mockExtraction([]);

    await extractMenuFromFile(await makeImage(400, 400), "image/jpeg");

    const content = createMock.mock.calls[0][0].messages[0].content;
    const image = content.find((b: { type: string }) => b.type === "image");
    expect(image.source.type).toBe("base64");
    expect(image.source.media_type).toBe("image/jpeg");
    expect(image.source.data.length).toBeGreaterThan(0);
  });

  it("downscales an oversized photo before uploading it", async () => {
    const { extractMenuFromFile } =
      await import("../../services/ai/menu-extract.service");
    mockExtraction([]);

    await extractMenuFromFile(await makeImage(4000, 3000), "image/jpeg");

    // A full-resolution phone photo costs several times the image tokens of a
    // downscaled one with no accuracy gain on printed text.
    const image = createMock.mock.calls[0][0].messages[0].content.find(
      (b: { type: string }) => b.type === "image",
    );
    const sent = Buffer.from(image.source.data, "base64");
    const meta = await sharp(sent).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(
      1568,
    );
  });

  it("passes a language hint through to the prompt", async () => {
    const { extractMenuFromFile } =
      await import("../../services/ai/menu-extract.service");
    mockExtraction([]);

    await extractMenuFromFile(await makeImage(400, 400), "image/jpeg", {
      languageHint: "Arabic",
    });

    const text = createMock.mock.calls[0][0].messages[0].content.find(
      (b: { type: string }) => b.type === "text",
    );
    expect(text.text).toContain("Arabic");
  });
});

describe("extractMenuFromFile — failure reporting", () => {
  it("distinguishes an empty menu from a failed extraction", async () => {
    const { extractMenuFromFile } =
      await import("../../services/ai/menu-extract.service");
    mockExtraction([]);

    const result = await extractMenuFromFile(
      await makeImage(400, 400),
      "image/jpeg",
    );

    // No menu found is a warning with no error — the caller can tell this
    // apart from a failure, which the old implementation could not.
    expect(result.errors).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("reports an API failure as an error, not a warning", async () => {
    const { extractMenuFromFile } =
      await import("../../services/ai/menu-extract.service");
    createMock.mockRejectedValue(new Error("connection reset"));

    const result = await extractMenuFromFile(
      await makeImage(400, 400),
      "image/jpeg",
    );

    // The regression this guards: the old version pushed this to `warnings`
    // and returned an empty list, so a total failure looked like a blank menu.
    expect(result.items).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("connection reset");
  });

  it("surfaces a truncated reply instead of returning partial JSON", async () => {
    const { extractMenuFromFile } =
      await import("../../services/ai/menu-extract.service");
    createMock.mockResolvedValue({
      stop_reason: "max_tokens",
      content: [{ type: "text", text: '{"items":[{"name":"Grill' }],
    });

    const result = await extractMenuFromFile(
      await makeImage(400, 400),
      "image/jpeg",
    );

    expect(result.items).toEqual([]);
    expect(result.errors.join(" ")).toMatch(/too long/i);
  });

  it("surfaces a safety refusal as a readable error", async () => {
    const { extractMenuFromFile } =
      await import("../../services/ai/menu-extract.service");
    createMock.mockResolvedValue({ stop_reason: "refusal", content: [] });

    const result = await extractMenuFromFile(
      await makeImage(400, 400),
      "image/jpeg",
    );

    // Reading content[0] unconditionally would throw here instead.
    expect(result.errors.join(" ")).toMatch(/safety/i);
  });

  it("rejects a non-image upload without calling the API", async () => {
    const { extractMenuFromFile } =
      await import("../../services/ai/menu-extract.service");

    const result = await extractMenuFromFile(
      Buffer.from("%PDF-1.4"),
      "application/pdf",
    );

    expect(result.errors.length).toBeGreaterThan(0);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects an empty upload without calling the API", async () => {
    const { extractMenuFromFile } =
      await import("../../services/ai/menu-extract.service");

    const result = await extractMenuFromFile(Buffer.alloc(0), "image/jpeg");

    expect(result.errors.length).toBeGreaterThan(0);
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("extractMenuFromFile — provider errors are translated, not leaked", () => {
  /** Builds a real SDK APIError, the way the client constructs one. */
  async function apiError(status: number, body: unknown) {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    return Anthropic.APIError.generate(status, body, "error", new Headers());
  }

  it("does not surface raw provider JSON to the user on a billing failure", async () => {
    const { extractMenuFromFile } =
      await import("../../services/ai/menu-extract.service");
    // The exact failure seen on a real unfunded account.
    createMock.mockRejectedValue(
      await apiError(400, {
        type: "error",
        error: {
          type: "invalid_request_error",
          message:
            "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.",
        },
      }),
    );

    const result = await extractMenuFromFile(
      await makeImage(400, 400),
      "image/jpeg",
    );

    const shown = result.errors.join(" ");
    // A restaurant owner must not be shown provider internals, told about a
    // "credit balance" they never bought, or blamed for their photo.
    expect(shown).not.toContain("credit balance");
    expect(shown).not.toContain("invalid_request_error");
    expect(shown).not.toContain("{");
    expect(shown).toMatch(/contact support/i);
  });

  it("tells the user to retry on a rate limit rather than blaming the image", async () => {
    const { extractMenuFromFile } =
      await import("../../services/ai/menu-extract.service");
    createMock.mockRejectedValue(
      await apiError(429, {
        type: "error",
        error: { type: "rate_limit_error" },
      }),
    );

    const result = await extractMenuFromFile(
      await makeImage(400, 400),
      "image/jpeg",
    );

    expect(result.errors.join(" ")).toMatch(/try again/i);
  });

  it("flags a bad API key as a configuration problem, not a user error", async () => {
    const { extractMenuFromFile } =
      await import("../../services/ai/menu-extract.service");
    createMock.mockRejectedValue(
      await apiError(401, {
        type: "error",
        error: { type: "authentication_error" },
      }),
    );

    const result = await extractMenuFromFile(
      await makeImage(400, 400),
      "image/jpeg",
    );

    expect(result.errors.join(" ")).toMatch(/not configured correctly/i);
  });
});
