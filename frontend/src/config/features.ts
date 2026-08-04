/**
 * Build-time feature flags.
 *
 * AI_ENABLED gates the customer-facing AI menu search and the dashboard's menu
 * OCR upload. It is **off by default**, and deliberately so: the backend's AI
 * routes return a clean "not configured" error whenever `ANTHROPIC_API_KEY` is
 * unset, so leaving the UI visible would give customers a search box that
 * always fails and a generic "Something wrong, please try again" toast — an
 * invitation to retry something that cannot work.
 *
 * Turning the feature back on takes two settings that must agree:
 *   1. `ANTHROPIC_API_KEY` on the backend service (makes the routes work)
 *   2. `VITE_AI_ENABLED=true` here (makes the UI appear)
 *
 * Setting only this one restores a UI whose requests will 406; setting only
 * the key leaves working endpoints with no way in from the UI. Neither is
 * harmful, but both are confusing, so change them together.
 *
 * `VITE_` prefixed values are inlined at build time, so flipping this needs a
 * rebuild, not just a restart.
 */
export const AI_ENABLED = import.meta.env.VITE_AI_ENABLED === "true";
