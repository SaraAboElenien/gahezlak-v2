import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Response } from "express";
import {
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_TTL_SECONDS,
  clearRefreshTokenCookie,
  setRefreshTokenCookie,
} from "../../config/cookies";

function mockRes() {
  const res: Partial<Response> = {
    cookie: vi.fn().mockReturnThis(),
    clearCookie: vi.fn().mockReturnThis(),
  };
  return res as Response;
}

const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe("setRefreshTokenCookie", () => {
  it("is always httpOnly, scoped to /api/v1/auth, and expires with the token", () => {
    const res = mockRes();

    setRefreshTokenCookie(res, "a-refresh-token");

    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_TOKEN_COOKIE,
      "a-refresh-token",
      expect.objectContaining({
        httpOnly: true,
        path: "/api/v1/auth",
        maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
      }),
    );
  });

  it("uses SameSite=None + Secure in production (frontend and backend are cross-origin there)", () => {
    process.env.NODE_ENV = "production";
    const res = mockRes();

    setRefreshTokenCookie(res, "a-refresh-token");

    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_TOKEN_COOKIE,
      "a-refresh-token",
      expect.objectContaining({ secure: true, sameSite: "none" }),
    );
  });

  it("uses SameSite=Lax without Secure outside production (plain-HTTP localhost)", () => {
    process.env.NODE_ENV = "development";
    const res = mockRes();

    setRefreshTokenCookie(res, "a-refresh-token");

    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_TOKEN_COOKIE,
      "a-refresh-token",
      expect.objectContaining({ secure: false, sameSite: "lax" }),
    );
  });
});

describe("clearRefreshTokenCookie", () => {
  // A browser matches cookies for deletion by name + domain + path, so a
  // mismatch between set and clear silently leaves the cookie in place —
  // i.e. sign-out wouldn't actually sign anyone out.
  it("clears with exactly the attributes the cookie was set with", () => {
    process.env.NODE_ENV = "production";
    const res = mockRes();

    setRefreshTokenCookie(res, "a-refresh-token");
    clearRefreshTokenCookie(res);

    // res.cookie/res.clearCookie are overloaded, so the inferred tuple types
    // don't cover the options argument — widen before indexing.
    const cookieCalls = vi.mocked(res.cookie).mock.calls as unknown[][];
    const clearCookieCalls = vi.mocked(res.clearCookie).mock
      .calls as unknown[][];

    const setOptions = cookieCalls[0][2] as Record<string, unknown>;
    const clearOptions = clearCookieCalls[0][1] as Record<string, unknown>;

    expect(clearCookieCalls[0][0]).toBe(REFRESH_TOKEN_COOKIE);
    for (const key of ["httpOnly", "secure", "sameSite", "path"]) {
      expect(clearOptions[key]).toBe(setOptions[key]);
    }
    // maxAge is deliberately absent: clearCookie sets its own past expiry.
    expect(clearOptions.maxAge).toBeUndefined();
  });
});
