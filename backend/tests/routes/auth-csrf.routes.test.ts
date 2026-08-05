import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import {
  connectTestDB,
  disconnectTestDB,
  clearTestDB,
} from "../db-test-helper";

/**
 * Cross-site protection for the two auth routes that act purely on the
 * httpOnly refresh cookie.
 *
 * `POST /auth/refresh` and `POST /auth/signout` need no request body and no
 * Authorization header — the browser's cookie is sufficient to make them do
 * their work. That is the exact shape a CSRF attack exploits: a third-party
 * page submits a form at one of them and the browser attaches the cookie
 * automatically. In production the cookie must be `SameSite=None` (frontend
 * and backend are on different origins), so SameSite itself cannot stop it.
 *
 * Neither route leaks a token to an attacker — the CORS allowlist makes the
 * response unreadable cross-origin — so the ceiling is a forced token rotation
 * or an unwanted logout, not account takeover. These tests exist because that
 * ceiling was the *only* thing recorded about the risk; what nobody had
 * verified is whether the request is refused at all. It is: this app's CORS
 * origin callback rejects a disallowed origin with an error rather than merely
 * omitting the response headers, so the handler never runs and no rotation
 * happens. That is a server-side origin check, and these tests pin it — if
 * anyone ever "simplifies" that callback into a plain `cors()`, or moves the
 * middleware below the routes, the protection vanishes silently and these fail.
 */

const ALLOWED_ORIGIN = "https://app.gahezlak.test";

process.env.JWT_SECRET ??= "test-jwt-secret";
process.env.MONGODB_URI ??= "mongodb://127.0.0.1:27017/unused-by-these-tests";
process.env.FRONTEND_URL = ALLOWED_ORIGIN;

async function getApp() {
  const { default: app } = await import("../../app");
  return app;
}

beforeAll(async () => {
  // The auth rate limiter's store is MongoDB-backed, so the routes need a live
  // connection even though these tests never read or write a user.
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  // Rate-limit counters live in the database; clearing between tests keeps the
  // 20-per-15-minutes auth limiter from bleeding across cases.
  await clearTestDB();
});

describe("cross-site requests to the cookie-driven auth routes", () => {
  const forgedCookie = `refreshToken=forged-value-an-attacker-cannot-read`;

  it("refuses a refresh submitted from a third-party origin", async () => {
    const app = await getApp();

    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Origin", "https://evil.example")
      .set("Cookie", forgedCookie);

    // Rejected by the CORS origin callback before the handler is reached.
    expect(res.status).toBe(405);
    // The decisive assertion: no rotation happened. A 4xx that still rotated
    // the token would be the vulnerability, since the attacker's goal is the
    // side effect, not the response body they can never read.
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("refuses a signout submitted from a third-party origin", async () => {
    const app = await getApp();

    const res = await request(app)
      .post("/api/v1/auth/signout")
      .set("Origin", "https://evil.example")
      .set("Cookie", forgedCookie);

    expect(res.status).toBe(405);
    // Nothing was cleared, so the victim is still logged in.
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("refuses a cross-site form post, the cheapest form of the attack", async () => {
    const app = await getApp();

    // `application/x-www-form-urlencoded` is what a bare <form> sends, and it
    // is a CORS "simple request": no preflight is issued, so a policy that
    // only answered OPTIONS would never see it. It still carries Origin.
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Origin", "https://evil.example")
      .set("Content-Type", "application/x-www-form-urlencoded")
      .set("Cookie", forgedCookie)
      .send("");

    expect(res.status).toBe(405);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("still lets the real frontend through to the handler", async () => {
    const app = await getApp();

    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Origin", ALLOWED_ORIGIN)
      .set("Cookie", forgedCookie);

    // The control case. This must NOT be 405: the request reaches the handler
    // and fails on the token's own merits (the forged value verifies against
    // nothing), which is what proves the tests above are measuring the origin
    // check rather than a route that rejects everything.
    expect(res.status).not.toBe(405);
    expect(res.status).toBe(401);
  });
});
