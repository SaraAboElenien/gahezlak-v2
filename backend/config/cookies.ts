import { CookieOptions, Response } from "express";

/**
 * Single source of truth for the refresh-token cookie.
 *
 * The refresh token is deliberately *not* returned in any JSON body: it lives
 * only in an httpOnly cookie so browser JS (and therefore any XSS payload)
 * can never read it. The short-lived access token is the only thing the
 * frontend holds, and it is kept in memory rather than localStorage.
 *
 * Set and clear MUST use identical attributes — a browser matches cookies for
 * deletion by name + domain + path, so a `clearCookie` with a different
 * `path`/`sameSite` silently leaves the old cookie in place. Keeping both
 * call sites in this module is what stops those from drifting apart.
 */

export const REFRESH_TOKEN_COOKIE = "refreshToken";

/**
 * Token lifetimes. These are the single source of truth for both the JWT
 * `expiresIn` values (services/auth.service.ts's generateTokens) and the
 * cookie's `maxAge`, so the cookie can never outlive — or die before — the
 * token it carries.
 */
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * In production the frontend and backend are served from different origins,
 * so the cookie has to be `SameSite=None` — which browsers only accept
 * together with `Secure`. Outside production the app runs on
 * localhost:5173 -> localhost:3000: differing ports do *not* make a request
 * cross-site, so `lax` works, and `secure` would make plain-HTTP localhost
 * drop the cookie entirely.
 */
function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function refreshCookieOptions(): CookieOptions {
  const production = isProduction();

  return {
    httpOnly: true,
    secure: production,
    sameSite: production ? "none" : "lax",
    // Scoped so the cookie only rides along on /api/v1/auth/* requests
    // instead of every unrelated API call.
    path: "/api/v1/auth",
  };
}

export function setRefreshTokenCookie(res: Response, token: string): void {
  res.cookie(REFRESH_TOKEN_COOKIE, token, {
    ...refreshCookieOptions(),
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
}

export function clearRefreshTokenCookie(res: Response): void {
  // No maxAge/expires here: clearCookie sets its own expiry in the past.
  // Every *other* attribute must match what was set above or the browser
  // keeps the original cookie.
  res.clearCookie(REFRESH_TOKEN_COOKIE, refreshCookieOptions());
}
