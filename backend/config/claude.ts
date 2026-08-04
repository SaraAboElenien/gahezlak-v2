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

export const AI_CONFIG = {
  MODEL: process.env.AI_MODEL || "claude-opus-5",
  /**
   * Generous by default: on Opus 5 thinking is on unless disabled, and
   * `max_tokens` caps thinking *and* the response together — a tight limit
   * truncates the answer mid-JSON rather than erroring.
   */
  MAX_TOKENS: parseInt(process.env.AI_MAX_TOKENS || "8000"),
};
