import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import {
  connectTestDB,
  disconnectTestDB,
  clearTestDB,
} from "../db-test-helper";
import { assertShopHasActiveSubscription } from "../../middlewares/subscription-check.middleware";
import { Subscriptions, SubscriptionStatus } from "../../models/Subscription";
import { NotAllowedError } from "../../errors/not-allowed-error";

// Regression coverage for the subscription-gating fixes documented in
// TECH_DEBT.md ("Subscription-gating middleware never wired up" /
// "Public order-creation endpoint not subscription-gated").

async function makeSubscription(
  status: SubscriptionStatus,
  shopId = new mongoose.Types.ObjectId(),
) {
  return Subscriptions.create({
    userId: new mongoose.Types.ObjectId(),
    shop: shopId,
    plan: new mongoose.Types.ObjectId(),
    status,
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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

describe("assertShopHasActiveSubscription", () => {
  it("throws when the shop has no subscription document at all", async () => {
    const shopId = new mongoose.Types.ObjectId();
    await expect(assertShopHasActiveSubscription(shopId)).rejects.toThrow(
      NotAllowedError,
    );
  });

  it.each([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING])(
    "resolves without throwing when status is %s",
    async (status) => {
      const shopId = new mongoose.Types.ObjectId();
      await makeSubscription(status, shopId);
      await expect(
        assertShopHasActiveSubscription(shopId),
      ).resolves.toBeUndefined();
    },
  );

  it.each([SubscriptionStatus.PENDING, SubscriptionStatus.CANCELLED])(
    "throws when status is %s",
    async (status) => {
      const shopId = new mongoose.Types.ObjectId();
      await makeSubscription(status, shopId);
      await expect(assertShopHasActiveSubscription(shopId)).rejects.toThrow(
        NotAllowedError,
      );
    },
  );

  it("throws when status is expired", async () => {
    const shopId = new mongoose.Types.ObjectId();
    await makeSubscription(SubscriptionStatus.EXPIRED, shopId);
    await expect(assertShopHasActiveSubscription(shopId)).rejects.toThrow(
      NotAllowedError,
    );
  });
});
