import { rateLimit } from "express-rate-limit";
import { Errors } from "../errors";
import { errMsg } from "../common/err-messages";
import { MongoRateLimitStore } from "./mongo-rate-limit-store";

// Both limiters below use a MongoDB-backed store rather than the default
// in-memory one. An in-memory counter lives in a single process's heap, so it
// enforces roughly (limit × running instances) and resets to zero on every
// restart or redeploy. That holds on Render as soon as the service runs more
// than one instance, and the reset-on-restart hole exists even with exactly
// one. Sharing counters through the database the app is already connected to
// makes the configured numbers below mean what they say, without adding
// infrastructure. See DECISIONS.md and models/RateLimit.ts.
//
// `passOnStoreError: true` lets a request through if the store itself errors.
// That is the right trade here rather than a fail-closed 500: every route
// behind these limiters needs the same database a moment later anyway, so a
// store outage would surface as a proper error from the handler instead of a
// misleading "too many requests".

// Applied to the whole /api/v1/auth router: covers login, registration,
// forgot/reset-password, refresh, and signout.
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: new MongoRateLimitStore("auth"),
  passOnStoreError: true,
  handler: (req, res, next) => {
    next(new Errors.TooManyRequestsError(errMsg.TOO_MANY_REQUESTS, req.lang));
  },
});

// AI endpoints. These are the only routes in the app where a single request
// costs real money on a third-party account, and the public search endpoint
// takes arbitrary customer-supplied text. Before this existed, `/ai/menu/*`
// was mounted with no limiter at all and its search routes sat *before* the
// auth middleware — so anyone on the internet could POST unlimited prompts
// and drain the Anthropic account, with prompt injection as a free extra.
//
// Keyed per IP by express-rate-limit's default. Deliberately tighter than the
// auth limiter: a customer searching a menu a few times a minute is normal,
// twenty times a minute is not.
export const aiRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  store: new MongoRateLimitStore("ai"),
  passOnStoreError: true,
  handler: (req, res, next) => {
    next(new Errors.TooManyRequestsError(errMsg.TOO_MANY_REQUESTS, req.lang));
  },
});

// Stricter limiter for the two endpoints that guard a brute-forceable
// 6-digit OTP: verify-code and resend-verification-code.
export const otpRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  store: new MongoRateLimitStore("otp"),
  passOnStoreError: true,
  handler: (req, res, next) => {
    next(
      new Errors.TooManyRequestsError(errMsg.TOO_MANY_OTP_ATTEMPTS, req.lang),
    );
  },
});

// The public per-shop QR code PNG (`GET /shops/name/:shopName/qr-code.png`).
// Unauthenticated by design — the dashboard's <img> tag has no session to
// spend, and the image is meant to be directly linkable — so, like the AI
// search route above, there is no auth gate to lean on and this limiter is
// the entire defence. Each request costs a real DB lookup plus a PNG encode
// rather than third-party money, so the limit is looser than the AI one but
// still bounded: generous enough for a dashboard re-rendering its settings
// page repeatedly, tight enough that hammering the endpoint can't turn a free
// CPU/DB cost into a denial-of-service knob.
export const qrCodeRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: new MongoRateLimitStore("qr-code"),
  passOnStoreError: true,
  handler: (req, res, next) => {
    next(new Errors.TooManyRequestsError(errMsg.TOO_MANY_REQUESTS, req.lang));
  },
});
