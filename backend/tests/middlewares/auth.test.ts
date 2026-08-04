import { describe, it, expect, vi } from "vitest";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { protect, isAllowed } from "../../middlewares/auth";
import { Errors } from "../../errors";

function mockRes() {
  const res: Partial<Response> = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as Response;
}

describe("protect", () => {
  it("responds 401 when no Authorization header is present", () => {
    const req = { headers: {} } as Request;
    const res = mockRes();
    const next = vi.fn();

    protect(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("throws UnauthenticatedError when the token is invalid", () => {
    const req = {
      headers: { authorization: "Bearer not-a-real-token" },
    } as Request;
    const res = mockRes();
    const next = vi.fn();

    expect(() => protect(req, res, next as NextFunction)).toThrow(
      Errors.UnauthenticatedError,
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("throws UnauthenticatedError when the token is expired", () => {
    const expiredToken = jwt.sign(
      { userId: "u1", email: "a@b.com", role: "user" },
      process.env.JWT_SECRET!,
      { expiresIn: -10 },
    );
    const req = {
      headers: { authorization: `Bearer ${expiredToken}` },
    } as Request;
    const res = mockRes();
    const next = vi.fn();

    expect(() => protect(req, res, next as NextFunction)).toThrow(
      Errors.UnauthenticatedError,
    );
  });

  it("attaches decoded payload to req.user and calls next() for a valid token", () => {
    const payload = { userId: "u1", email: "a@b.com", role: "user" };
    const token = jwt.sign(payload, process.env.JWT_SECRET!, {
      expiresIn: "1h",
    });
    const req = { headers: { authorization: `Bearer ${token}` } } as Request;
    const res = mockRes();
    const next = vi.fn();

    protect(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject(payload);
  });
});

describe("isAllowed", () => {
  it("throws UnauthorizedError when req.user.role is not in the allowed list", () => {
    const req = { user: { role: "user" } } as Request;
    const res = mockRes();
    const next = vi.fn();

    expect(() => isAllowed(["admin"])(req, res, next as NextFunction)).toThrow(
      Errors.UnauthorizedError,
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("throws UnauthorizedError when req.user is missing entirely", () => {
    const req = {} as Request;
    const res = mockRes();
    const next = vi.fn();

    expect(() => isAllowed(["admin"])(req, res, next as NextFunction)).toThrow(
      Errors.UnauthorizedError,
    );
  });

  it("calls next() when req.user.role is in the allowed list", () => {
    const req = { user: { role: "admin" } } as Request;
    const res = mockRes();
    const next = vi.fn();

    isAllowed(["admin", "owner"])(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
