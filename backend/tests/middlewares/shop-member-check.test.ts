import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  vi,
} from "vitest";
import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import {
  connectTestDB,
  disconnectTestDB,
  clearTestDB,
} from "../db-test-helper";
import { checkShopAccess } from "../../middlewares/shop-member-check.middleware";
import { NotAllowedError } from "../../errors/not-allowed-error";
import { Shops } from "../../models/Shop";

// Regression coverage for the IDOR fix documented in TECH_DEBT.md/SECURITY.md
// ("Shop/Order IDOR via isShopMember middleware"): checkShopAccess("member")
// must scope to the *specific requested* shopId, not just "some shop the
// caller belongs to" — otherwise a member of shop A could read/write shop B
// by passing B's id in the URL.

async function makeShop(
  overrides: Partial<Parameters<typeof Shops.create>[0]> = {},
) {
  return Shops.create({
    name: `Shop ${new mongoose.Types.ObjectId()}`,
    type: "restaurant",
    address: { country: "EG", city: "Cairo", street: "1 Test St" },
    phoneNumber: "01012345678",
    email: "shop@example.com",
    ownerId: new mongoose.Types.ObjectId(),
    ...overrides,
  });
}

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

afterEach(async () => {
  await clearTestDB();
});

describe("checkShopAccess('member') — cross-tenant IDOR protection", () => {
  it("calls next() when the caller owns the requested shop", async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const shop = await makeShop({ ownerId });

    const req = {
      user: { userId: ownerId.toString() },
      params: { shopId: shop._id.toString() },
      body: {},
    } as unknown as Request;
    const next = vi.fn();

    await checkShopAccess("member")(req, {} as Response, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it("calls next() when the caller is a member of the requested shop", async () => {
    const memberUserId = new mongoose.Types.ObjectId();
    const shop = await makeShop({
      members: [
        { userId: memberUserId, roleId: new mongoose.Types.ObjectId() },
      ],
    });

    const req = {
      user: { userId: memberUserId.toString() },
      params: { shopId: shop._id.toString() },
      body: {},
    } as unknown as Request;
    const next = vi.fn();

    await checkShopAccess("member")(req, {} as Response, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it("rejects a member of shop A requesting shop B (the IDOR case)", async () => {
    const attackerUserId = new mongoose.Types.ObjectId();
    // attacker is a legitimate member of shopA ...
    await makeShop({
      members: [
        { userId: attackerUserId, roleId: new mongoose.Types.ObjectId() },
      ],
    });
    // ... but tries to access shopB, which they have no relationship to
    const shopB = await makeShop();

    const req = {
      user: { userId: attackerUserId.toString() },
      params: { shopId: shopB._id.toString() },
      body: {},
    } as unknown as Request;
    const next = vi.fn();

    await expect(
      checkShopAccess("member")(req, {} as Response, next as NextFunction),
    ).rejects.toThrow(NotAllowedError);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects when no user has any relationship to the requested shop", async () => {
    const shop = await makeShop();
    const strangerId = new mongoose.Types.ObjectId();

    const req = {
      user: { userId: strangerId.toString() },
      params: { shopId: shop._id.toString() },
      body: {},
    } as unknown as Request;
    const next = vi.fn();

    await expect(
      checkShopAccess("member")(req, {} as Response, next as NextFunction),
    ).rejects.toThrow(NotAllowedError);
  });

  it("throws NotAllowedError when no shopId can be resolved at all", async () => {
    const req = {
      user: { userId: new mongoose.Types.ObjectId().toString() },
      params: {},
      body: {},
    } as unknown as Request;
    const next = vi.fn();

    await expect(
      checkShopAccess("member")(req, {} as Response, next as NextFunction),
    ).rejects.toThrow(NotAllowedError);
  });
});

describe("checkShopAccess('owner')", () => {
  it("rejects a shop member (non-owner) from an owner-only action", async () => {
    const memberUserId = new mongoose.Types.ObjectId();
    const shop = await makeShop({
      members: [
        { userId: memberUserId, roleId: new mongoose.Types.ObjectId() },
      ],
    });

    const req = {
      user: { userId: memberUserId.toString() },
      params: { shopId: shop._id.toString() },
      body: {},
    } as unknown as Request;
    const next = vi.fn();

    await expect(
      checkShopAccess("owner")(req, {} as Response, next as NextFunction),
    ).rejects.toThrow(NotAllowedError);
  });

  it("calls next() for the actual owner", async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const shop = await makeShop({ ownerId });

    const req = {
      user: { userId: ownerId.toString() },
      params: { shopId: shop._id.toString() },
      body: {},
    } as unknown as Request;
    const next = vi.fn();

    await checkShopAccess("owner")(req, {} as Response, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
