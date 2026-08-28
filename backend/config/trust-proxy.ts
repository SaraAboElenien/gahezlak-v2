/**
 * How many reverse-proxy hops sit in front of this app.
 *
 * Why this exists: without it, `app.set("trust proxy", ...)` is never called,
 * so Express reports `req.ip` as the *socket* address — which on Render is
 * always `127.0.0.1`, its local proxy. Every client therefore looked like the
 * same IP. express-rate-limit detected the contradiction itself and logged
 * `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` on every request, but the practical
 * effect was worse than a noisy log: with no custom `keyGenerator`, the
 * limiters key on `req.ip`, so **every user in the world shared one counter**.
 * The auth limiter's 20-per-15-minutes was global, not per-IP: one person
 * exhausting it locked everybody out of login, and the limiter was providing
 * none of the per-client protection it was added for.
 *
 * Why a NUMBER and never `true`:
 *   `trust proxy: true` makes Express believe the *left-most* X-Forwarded-For
 *   entry, which is entirely attacker-controlled — a client can send
 *   `X-Forwarded-For: 1.2.3.4` and choose its own rate-limit bucket, which
 *   defeats the limiter just as completely as the bug above. A fixed hop
 *   count is counted from the *right* (nearest the server), so injected
 *   entries are pushed further left and ignored.
 *
 * Why 3, specifically. Observed on the live deployment (2026-08-24):
 *
 *   remoteAddress: 127.0.0.1                                   <- Render proxy
 *   x-forwarded-for: 41.235.236.31, 172.70.108.57, 10.24.184.2
 *                    ^client        ^Cloudflare    ^Render internal
 *
 * proxy-addr evaluates [socket, ...XFF reversed]:
 *   [127.0.0.1, 10.24.184.2, 172.70.108.57, 41.235.236.31]
 * Trusting 3 hops skips the first three and yields the real client. Render
 * fronts every *.onrender.com service with Cloudflare, which is where the
 * middle hop comes from.
 *
 * If that topology ever changes, set TRUST_PROXY_HOPS rather than editing this
 * file — and verify by logging `req.ip` for a request whose real origin you
 * know, because a wrong value here fails silently in exactly the way the
 * original bug did.
 */

/** Hops in front of the app on Render (Render's proxy + Cloudflare). */
export const RENDER_PROXY_HOPS = 3;

/**
 * Resolved as a pure function of the environment so it can be tested without
 * booting the app. Kept separate from `app.ts` for that reason alone.
 *
 * Local development runs with no proxy at all, so the default outside
 * production is 0 — trusting a hop that does not exist would make `req.ip`
 * read a header the client itself supplied.
 */
export function resolveTrustProxyHops(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const configured = env.TRUST_PROXY_HOPS;

  if (configured !== undefined && configured !== "") {
    const parsed = Number(configured);
    // A malformed value must not silently become 0 (the broken state) or NaN
    // (which Express treats as "trust nothing" just as quietly).
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new Error(
        `TRUST_PROXY_HOPS must be a non-negative integer, received "${configured}". ` +
          "It is the number of reverse proxies in front of this app; see config/trust-proxy.ts.",
      );
    }
    return parsed;
  }

  return env.NODE_ENV === "production" ? RENDER_PROXY_HOPS : 0;
}
