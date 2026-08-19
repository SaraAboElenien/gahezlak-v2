import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./pino";

/**
 * Claude client for the AI menu features (OCR, enrichment, search).
 *
 * Lazy by design, matching config/sentry.ts: the client is only constructed on
 * first use, so the app boots and every non-AI route works normally with no
 * API key configured. Previously this threw at module load, which is the same
 * eager-initialisation mistake that once took the entire API down from
 * utils/send-email.ts (see CHANGELOG.md).
 */
let client: Anthropic | null = null;

export const getClaudeClient = (): Anthropic => {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      logger.error("ANTHROPIC_API_KEY is not set — AI features are disabled");
      throw new Error("ANTHROPIC_API_KEY is required for AI features");
    }
    client = new Anthropic({ apiKey });
    logger.info("Claude client initialised");
  }
  return client;
};

/** Whether AI features can run at all. Lets callers 503 instead of throwing. */
export const aiEnabled = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);

/** Effort levels `output_config.effort` accepts, cheapest first. */
const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;
export type AiEffort = (typeof EFFORT_LEVELS)[number];

/**
 * Models that reject `output_config.effort` outright — the API answers
 * `400 "This model does not support the effort parameter."`, on every request,
 * so sending it to one of these takes all three AI features down completely.
 *
 * Expressed as an exclusion list rather than an allowlist on purpose: newer
 * models support effort, so an unknown model id is far more likely to be a
 * future model that accepts it than a small one that doesn't. An allowlist
 * would silently drop the cost saving every time a new model ships.
 *
 * Found by a real API call, not by a test — the mocked suite was green, and
 * `claude-haiku-4-5` is precisely the model the cost note recommends.
 */
const MODELS_WITHOUT_EFFORT = /haiku|sonnet-4-5/i;

/**
 * The effort to send, or `null` to omit the parameter entirely.
 *
 * `AI_EFFORT` is validated rather than trusted: an unrecognised value is
 * rejected by the API on *every* AI request, and a typo in a hosting
 * dashboard's env var is a far likelier way to get one here than a code
 * change — so a bad value degrades to the default and says so, instead of
 * taking all three features down.
 */
function resolveEffort(model: string): AiEffort | null {
  const raw = process.env.AI_EFFORT?.trim().toLowerCase();

  // An explicit off-switch, for a model this list doesn't know about yet.
  if (raw === "off" || raw === "none") return null;

  if (MODELS_WITHOUT_EFFORT.test(model)) {
    if (raw) {
      logger.warn(
        { AI_MODEL: model, AI_EFFORT: raw },
        "AI_EFFORT is ignored: this model rejects the effort parameter",
      );
    }
    return null;
  }

  if (!raw) return "low";
  if ((EFFORT_LEVELS as readonly string[]).includes(raw)) {
    return raw as AiEffort;
  }
  logger.warn(
    { AI_EFFORT: process.env.AI_EFFORT },
    `AI_EFFORT must be one of ${EFFORT_LEVELS.join(", ")} — falling back to "low"`,
  );
  return "low";
}

/**
 * Builds `output_config` for a request, attaching `effort` only when the
 * model that will serve it accepts the parameter.
 *
 * Centralised so the three services cannot drift: `effort` has to be inside
 * the same `output_config` object as `format`, and one service quietly keeping
 * a hardcoded value is exactly the kind of thing that shows up as a bill.
 *
 * `model` is a parameter rather than read from config because enrichment can
 * run on a different model from search and OCR — and effort support is a
 * property of the model, so resolving it against the wrong one reintroduces
 * the 400 this indirection exists to prevent.
 */
export function outputConfig<T>(schema: T, model: string = AI_CONFIG.MODEL) {
  const effort = resolveEffort(model);
  return {
    ...(effort ? { effort } : {}),
    format: { type: "json_schema" as const, schema },
  };
}

export const AI_CONFIG = {
  MODEL: process.env.AI_MODEL || "claude-opus-5",

  /**
   * The model used for allergen/dietary enrichment specifically. Falls back to
   * `MODEL` when unset, so this is opt-in and changes nothing by default.
   *
   * It exists because enrichment and search have opposite cost profiles and
   * opposite tolerances for being wrong. Search runs once per visitor and its
   * job is turning a phrase into filters — a small model does that perfectly
   * well, and it is where the per-visitor bill accrues. Enrichment runs once
   * per dish per menu change and decides whether a nut-allergic customer is
   * shown a dish containing pesto.
   *
   * Measured on this menu (2026-08-19): enriching the same 42 items twice on
   * claude-haiku-4-5 produced different allergen sets for the same dish, and
   * one run dropped `tree nuts` from a pesto wrap entirely. Tying both paths
   * to one `AI_MODEL` forced a choice between paying Opus rates on every
   * visitor search and accepting that variance in the allergy data.
   */
  get ENRICH_MODEL(): string {
    return process.env.AI_ENRICH_MODEL || this.MODEL;
  },
  /**
   * Generous by default: on Opus 5 thinking is on unless disabled, and
   * `max_tokens` caps thinking *and* the response together — a tight limit
   * truncates the answer mid-JSON rather than erroring.
   */
  MAX_TOKENS: parseInt(process.env.AI_MAX_TOKENS || "8000"),
  /**
   * How hard the model works per request, defaulting to "low" rather than the
   * API's own default of "high".
   *
   * Every call this app makes is structured extraction against a fixed JSON
   * schema — read the prices off a menu photo, list a dish's allergens, turn
   * "something light with no dairy" into filters. None of that needs deep
   * reasoning, and effort is precisely what the account is billed on: at
   * "high" all three paths spend thinking tokens for no accuracy gain.
   *
   * Raise it with AI_EFFORT if OCR on difficult menu photos disappoints —
   * that is the one path where it plausibly might. Resolved on each read so
   * the value can be changed without restarting a test process.
   *
   * `null` means "omit the parameter": some models reject it outright. Prefer
   * `outputConfig()` over reading this directly.
   */
  get EFFORT(): AiEffort | null {
    return resolveEffort(this.MODEL);
  },
};
