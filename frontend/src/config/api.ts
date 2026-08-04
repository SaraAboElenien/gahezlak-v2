/**
 * The single source of truth for the backend API base URL.
 *
 * Three service modules each used to inline
 * `import.meta.env.VITE_API_URL || "https://gahezlak-pi.vercel.app/api/v1"`.
 * That hardcoded fallback caused a real, long-lived bug: with no local
 * override, every `npm run dev` session silently talked to the *production*
 * API instead of the local backend (see TECH_DEBT.md). It is also now simply
 * wrong — that Vercel deployment is being retired in favour of Render.
 *
 * There is deliberately no host fallback any more. `VITE_API_URL` is baked in
 * at build time (`.env.development` locally, the Render service's environment
 * for a deploy), and a missing value is a misconfiguration that should be
 * obvious rather than quietly resolved to somebody else's server. Falling back
 * to a same-origin relative path means requests fail visibly against the site
 * itself instead of succeeding against the wrong backend.
 */
const configured = import.meta.env.VITE_API_URL?.trim();

if (!configured && typeof console !== "undefined") {
  console.error(
    "VITE_API_URL is not set — API calls will be made against this site's " +
      "own origin and will fail. Set it in .env.development locally, or in " +
      "the frontend service's environment when deploying.",
  );
}

/** e.g. `https://gahezlak-api.onrender.com/api/v1` */
export const BASE_URL = (configured || "/api/v1").replace(/\/+$/, "");
