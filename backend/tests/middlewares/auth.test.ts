import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import type { Request, Response, NextFunction } from "express";
import { protect, isAllowed } from "../../middlewares/auth";
import { Errors } from "../../errors";
import { Role } from "../../models/Role";
import {
  connectTestDB,
  disconnectTestDB,
  clearTestDB,
} from "../db-test-helper";

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

/**
 * `isAllowed` resolves the caller's role from the database, not from the
 * token claim, so these run against a real mongod.
 *
 * The claim is a snapshot taken at sign-in and access tokens live an hour.
 * Trusting it meant demoting a manager changed the label the dashboard showed
 * and left every manager permission working until their token expired — the
 * failure where an administrator believes access is revoked and it is not.
 */
describe("isAllowed", () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  async function seedUserWithRole(roleName: Role) {
    const { Roles } = await import("../../models/Role");
    const { Users } = await import("../../models/User");
    const role = await Roles.create({ name: roleName });
    const user = await Users.create({
      firstName: "Test",
      lastName: "User",
      email: `${roleName}.${Date.now()}@example.com`,
      password: "hashed-not-used-here",
      phoneNumber: "+201000000000",
      role: role._id,
      isVerified: true,
    });
    return { user, role };
  }

  it("allows a caller whose stored role is in the list", async () => {
    const { user } = await seedUserWithRole(Role.ADMIN);
    const req = {
      user: { userId: user._id.toString(), role: Role.ADMIN },
    } as Request;
    const next = vi.fn();

    await isAllowed([Role.ADMIN, Role.SHOP_OWNER])(
      req,
      mockRes(),
      next as NextFunction,
    );

    expect(next).toHaveBeenCalledTimes(1);
  });

  it("refuses a caller whose stored role is not in the list", async () => {
    const { user } = await seedUserWithRole(Role.USER);
    const req = {
      user: { userId: user._id.toString(), role: Role.USER },
    } as Request;
    const next = vi.fn();

    await expect(
      isAllowed([Role.ADMIN])(req, mockRes(), next as NextFunction),
    ).rejects.toThrow(Errors.UnauthorizedError);
    expect(next).not.toHaveBeenCalled();
  });

  it("refuses a demoted user still carrying a manager token claim", async () => {
    // The bug this middleware was changed to fix. The token was minted while
    // they were a manager and is still valid; the demotion has landed in the
    // database. Reading the claim would let them through for up to an hour.
    const { user } = await seedUserWithRole(Role.SHOP_STAFF);
    const req = {
      user: { userId: user._id.toString(), role: Role.SHOP_MANAGER },
    } as Request;
    const next = vi.fn();

    await expect(
      isAllowed([Role.SHOP_OWNER, Role.SHOP_MANAGER])(
        req,
        mockRes(),
        next as NextFunction,
      ),
    ).rejects.toThrow(Errors.UnauthorizedError);
    expect(next).not.toHaveBeenCalled();
  });

  it("overwrites the stale claim so handlers downstream cannot read it", async () => {
    // Half a fix is no fix: handlers read req.user.role, so leaving the old
    // value in place would move the same bug one layer along.
    const { user } = await seedUserWithRole(Role.SHOP_STAFF);
    const req = {
      user: { userId: user._id.toString(), role: Role.SHOP_MANAGER },
    } as Request;

    await isAllowed([Role.SHOP_STAFF])(req, mockRes(), vi.fn() as NextFunction);

    expect(req.user?.role).toBe(Role.SHOP_STAFF);
  });

  it("refuses a caller whose user record no longer exists", async () => {
    const req = {
      user: {
        userId: new mongoose.Types.ObjectId().toString(),
        role: Role.ADMIN,
      },
    } as Request;

    // A deleted account with a live token must not keep its permissions.
    await expect(
      isAllowed([Role.ADMIN])(req, mockRes(), vi.fn() as NextFunction),
    ).rejects.toThrow(Errors.UnauthorizedError);
  });

  it("refuses an unauthenticated request", async () => {
    const req = {} as Request;

    await expect(
      isAllowed([Role.ADMIN])(req, mockRes(), vi.fn() as NextFunction),
    ).rejects.toThrow(Errors.UnauthenticatedError);
  });
});
