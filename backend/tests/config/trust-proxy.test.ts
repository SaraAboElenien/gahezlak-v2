import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import {
  resolveTrustProxyHops,
  RENDER_PROXY_HOPS,
} from "../../config/trust-proxy";

/**
 * Regression coverage for a bug that reported itself for weeks and was still
 * missed: express-rate-limit logged ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on
 * every single production request, because `trust proxy` was never set.
 *
 * The log noise was not the damage. With `trust proxy` unset, Express reports
 * the socket address — on Render always 127.0.0.1, its local proxy — as
 * `req.ip`. The limiters use the default keyGenerator, which keys on `req.ip`.
 * So every client in the world shared ONE bucket: the auth limiter's
 * 20-per-15-minutes was a global budget, and one person exhausting it locked
 * everybody out of login while providing none of the per-client protection it
 * was added for.
 *
 * The second half of these tests is the more important one. A hop COUNT is
 * used rather than `trust proxy: true` precisely because the left-most
 * X-Forwarded-For entry is attacker-supplied; `true` would let any client pick
 * its own rate-limit bucket, which defeats the limiter exactly as thoroughly
 * as the original bug. The spoofing test pins that.
 */

describe("resolveTrustProxyHops", () => {
  it("trusts nothing outside production, where there is no proxy", () => {
    expect(resolveTrustProxyHops({ NODE_ENV: "development" })).toBe(0);
    expect(resolveTrustProxyHops({ NODE_ENV: "test" })).toBe(0);
  });

  it("trusts Render's proxy chain in production", () => {
    expect(resolveTrustProxyHops({ NODE_ENV: "production" })).toBe(
      RENDER_PROXY_HOPS,
    );
  });

  it("lets the deployment override the hop count", () => {
    expect(
      resolveTrustProxyHops({ NODE_ENV: "production", TRUST_PROXY_HOPS: "1" }),
    ).toBe(1);
    // Explicitly choosing 0 in production must be honoured, not overridden.
    expect(
      resolveTrustProxyHops({ NODE_ENV: "production", TRUST_PROXY_HOPS: "0" }),
    ).toBe(0);
  });

  it("refuses a malformed override instead of silently degrading", () => {
    // The failure mode being avoided: "yes"/"true"/"" quietly becoming 0 or
    // NaN, which Express treats as "trust nothing" — i.e. back to the bug,
    // with no signal at all.
    for (const bad of ["yes", "true", "-1", "2.5"]) {
      expect(() => resolveTrustProxyHops({ TRUST_PROXY_HOPS: bad })).toThrow(
        /TRUST_PROXY_HOPS/,
      );
    }
  });

  it("falls back to the environment default when the override is empty", () => {
    expect(
      resolveTrustProxyHops({ NODE_ENV: "production", TRUST_PROXY_HOPS: "" }),
    ).toBe(RENDER_PROXY_HOPS);
  });
});

/**
 * Behavioural half: what Express actually resolves req.ip to, given the exact
 * header chain observed on the live deployment on 2026-08-24.
 */
describe("req.ip through Render's proxy chain", () => {
  const CLIENT = "41.235.236.31";
  const CLOUDFLARE = "172.70.108.57";
  const RENDER_INTERNAL = "10.24.184.2";
  const REAL_CHAIN = `${CLIENT}, ${CLOUDFLARE}, ${RENDER_INTERNAL}`;

  function appWithHops(hops: number) {
    const app = express();
    app.set("trust proxy", hops);
    app.get("/whoami", (req, res) => {
      res.json({ ip: req.ip });
    });
    return app;
  }

  it("resolves the real client IP with the production hop count", async () => {
    const res = await request(appWithHops(RENDER_PROXY_HOPS))
      .get("/whoami")
      .set("X-Forwarded-For", REAL_CHAIN);

    expect(res.body.ip).toBe(CLIENT);
  });

  it("collapses every client to one address when unset — the bug", async () => {
    const res = await request(appWithHops(0))
      .get("/whoami")
      .set("X-Forwarded-For", REAL_CHAIN);

    // Not the client. This is the value the rate limiters were keying on for
    // every request from every user.
    expect(res.body.ip).not.toBe(CLIENT);
  });

  it("ignores an X-Forwarded-For entry the client injected itself", async () => {
    // A client prepending its own entry: the proxies append theirs to the
    // right, so counting from the right steps over the forgery.
    const res = await request(appWithHops(RENDER_PROXY_HOPS))
      .get("/whoami")
      .set("X-Forwarded-For", `1.2.3.4, ${REAL_CHAIN}`);

    expect(res.body.ip).toBe(CLIENT);
    expect(res.body.ip).not.toBe("1.2.3.4");
  });

  it("would honour that forgery if trust proxy were `true`", async () => {
    // Kept as a live demonstration of why the hop count is not negotiable: the
    // attacker picks their own rate-limit bucket, and can rotate it freely.
    const app = express();
    app.set("trust proxy", true);
    app.get("/whoami", (req, res) => res.json({ ip: req.ip }));

    const res = await request(app)
      .get("/whoami")
      .set("X-Forwarded-For", `1.2.3.4, ${REAL_CHAIN}`);

    expect(res.body.ip).toBe("1.2.3.4");
  });
});

/**
 * The tests above build their own Express apps, so on their own they would all
 * still pass if `app.set("trust proxy", ...)` were deleted from app.ts. This
 * one pins the wiring itself, which is the line an unrelated refactor would
 * quietly drop.
 */
describe("app.ts wiring", () => {
  // Importing app.ts runs config/env-validation, which fails fast on these.
  // Same pattern as tests/routes/auth-csrf.routes.test.ts; no connection is
  // opened by the import itself (see tests/app-entrypoint.test.ts).
  beforeEach(() => {
    process.env.MONGODB_URI ??= "mongodb://127.0.0.1:27017/unused-by-this-test";
    process.env.FRONTEND_URL ??= "https://app.gahezlak.test";
  });

  it("sets trust proxy on the real app", async () => {
    const { default: app } = await import("../../app");

    // NOT `toBeDefined()`: Express defaults this setting to `false`, so a
    // presence check passes even when app.set is deleted -- the very state
    // this test exists to catch. Assert the configured value instead.
    expect(app.get("trust proxy")).toBe(resolveTrustProxyHops());
    expect(app.get("trust proxy")).not.toBe(false);
  });

  it("uses a numeric hop count, never `true`", async () => {
    const { default: app } = await import("../../app");

    // `true` would trust the attacker-supplied left-most XFF entry. Guarding
    // the type, not just the presence, is the point.
    expect(typeof app.get("trust proxy")).toBe("number");
  });
});
