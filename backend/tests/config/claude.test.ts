import { describe, it, expect, afterEach } from "vitest";
import { AI_CONFIG, aiEnabled, outputConfig } from "../../config/claude";

/**
 * The AI knobs are the only settings in this project that change what a
 * request costs, and all three are read from the environment — so a typo in a
 * hosting dashboard is the realistic failure, not a bad code change.
 *
 * `EFFORT` is the one worth guarding. It is sent on every AI request, and an
 * unrecognised value is rejected by the API, so a bad value would take menu
 * OCR, enrichment and search down together with an error that mentions none
 * of them.
 */

const originalEffort = process.env.AI_EFFORT;
const originalModel = AI_CONFIG.MODEL;

afterEach(() => {
  if (originalEffort === undefined) delete process.env.AI_EFFORT;
  else process.env.AI_EFFORT = originalEffort;
  (AI_CONFIG as { MODEL: string }).MODEL = originalModel;
});

describe("AI_CONFIG.EFFORT", () => {
  it("defaults to low rather than the API default of high", () => {
    delete process.env.AI_EFFORT;

    // Every call this app makes is fixed-schema extraction. Defaulting to the
    // API's "high" would spend thinking tokens on all three paths for no
    // accuracy gain, and nothing in the response would look different.
    expect(AI_CONFIG.EFFORT).toBe("low");
  });

  it("accepts each level the API supports", () => {
    for (const level of ["low", "medium", "high", "xhigh", "max"]) {
      process.env.AI_EFFORT = level;
      expect(AI_CONFIG.EFFORT).toBe(level);
    }
  });

  it("tolerates surrounding whitespace and casing", () => {
    process.env.AI_EFFORT = "  Medium ";
    expect(AI_CONFIG.EFFORT).toBe("medium");
  });

  it("falls back to low on an unrecognised value instead of failing every request", () => {
    process.env.AI_EFFORT = "very-high";

    // Degrade, don't break: the alternative is a 400 on every AI call whose
    // message says nothing about an env var.
    expect(AI_CONFIG.EFFORT).toBe("low");
  });

  it("treats an empty value as unset", () => {
    process.env.AI_EFFORT = "";
    expect(AI_CONFIG.EFFORT).toBe("low");
  });

  it("is omitted entirely for a model that rejects the parameter", () => {
    // Found by a real API call: claude-haiku-4-5 answers
    // `400 This model does not support the effort parameter` — on every
    // request, so sending it takes OCR, enrichment and search down together.
    // Haiku is also exactly the model the cost note recommends, so this is the
    // configuration a reader is most likely to try.
    (AI_CONFIG as { MODEL: string }).MODEL = "claude-haiku-4-5";
    expect(AI_CONFIG.EFFORT).toBeNull();
  });

  it("ignores an explicit AI_EFFORT on a model that rejects it, rather than 400ing", () => {
    (AI_CONFIG as { MODEL: string }).MODEL = "claude-haiku-4-5";
    process.env.AI_EFFORT = "high";
    expect(AI_CONFIG.EFFORT).toBeNull();
  });

  it("can be switched off explicitly for a model this list does not know", () => {
    // The escape hatch: the exclusion list cannot anticipate every model, so
    // there has to be a way to drop the parameter without editing code.
    process.env.AI_EFFORT = "off";
    expect(AI_CONFIG.EFFORT).toBeNull();
  });
});

describe("AI_CONFIG.ENRICH_MODEL", () => {
  const originalEnrich = process.env.AI_ENRICH_MODEL;

  afterEach(() => {
    if (originalEnrich === undefined) delete process.env.AI_ENRICH_MODEL;
    else process.env.AI_ENRICH_MODEL = originalEnrich;
  });

  it("falls back to AI_MODEL when unset, so the split is opt-in", () => {
    delete process.env.AI_ENRICH_MODEL;
    (AI_CONFIG as { MODEL: string }).MODEL = "claude-haiku-4-5";

    expect(AI_CONFIG.ENRICH_MODEL).toBe("claude-haiku-4-5");
  });

  it("overrides AI_MODEL for the enrichment path only", () => {
    // The point of the split: enrichment decides whether a nut-allergic
    // customer is shown a dish with pesto in it, and runs once per menu
    // change; search runs once per visitor. They should not share a dial.
    (AI_CONFIG as { MODEL: string }).MODEL = "claude-haiku-4-5";
    process.env.AI_ENRICH_MODEL = "claude-opus-5";

    expect(AI_CONFIG.ENRICH_MODEL).toBe("claude-opus-5");
    expect(AI_CONFIG.MODEL).toBe("claude-haiku-4-5");
  });
});

describe("outputConfig", () => {
  it("attaches effort alongside the schema when the model supports it", () => {
    delete process.env.AI_EFFORT;
    (AI_CONFIG as { MODEL: string }).MODEL = "claude-opus-5";

    const cfg = outputConfig({ type: "object" });

    // Both must sit in the same object — `effort` is not a top-level request
    // parameter, and the API ignores it silently if it is misplaced.
    expect(cfg).toEqual({
      effort: "low",
      format: { type: "json_schema", schema: { type: "object" } },
    });
  });

  it("omits the key entirely rather than sending effort: null", () => {
    (AI_CONFIG as { MODEL: string }).MODEL = "claude-haiku-4-5";

    const cfg = outputConfig({ type: "object" });

    // `effort: null` is not the same as an absent key to a validating API.
    expect("effort" in cfg).toBe(false);
    expect(cfg.format.schema).toEqual({ type: "object" });
  });

  it("resolves effort against the model given, not the globally configured one", () => {
    // The trap the `model` parameter exists to close. With AI_MODEL on Opus
    // and enrichment pinned to Haiku, resolving against the global would
    // attach `effort` to a request Haiku rejects outright — a 400 on every
    // enrichment call, from a config change that looks unrelated.
    delete process.env.AI_EFFORT;
    (AI_CONFIG as { MODEL: string }).MODEL = "claude-opus-5";

    expect("effort" in outputConfig({}, "claude-haiku-4-5")).toBe(false);
    expect(outputConfig({}, "claude-opus-5")).toHaveProperty("effort", "low");
  });
});

describe("aiEnabled", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it("is false with no key, so callers can refuse cleanly instead of throwing", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(aiEnabled()).toBe(false);
  });

  it("is true once a key is configured", () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    expect(aiEnabled()).toBe(true);
  });
});
