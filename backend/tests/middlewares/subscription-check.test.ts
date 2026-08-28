import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import {
  connectTestDB,
  disconnectTestDB,
  clearTestDB,
} from "../db-test-helper";
import { assertShopHasActiveSubscription } from "../../middlewares/subscription-check.middleware";
import {
  Subscriptions,
  SubscriptionStatus,
  ACTIVE_GRACE_PERIOD_MS,
} from "../../models/Subscription";
import { errMsg } from "../../common/err-messages";
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

  it("throws when status is pending", async () => {
    const shopId = new mongoose.Types.ObjectId();
    await makeSubscription(SubscriptionStatus.PENDING, shopId);
    await expect(assertShopHasActiveSubscription(shopId)).rejects.toThrow(
      NotAllowedError,
    );
  });

  it("admits a cancelled subscription still inside its paid period", async () => {
    // Previously this threw. Cancelling stops the renewal, not the month the
    // shop already paid for — makeSubscription's currentPeriodEnd is 30 days
    // out. The gate refusing here while the re-subscribe guard honoured the
    // same grace period is what left paid-up shops unable to trade *and*
    // unable to buy a replacement plan.
    const shopId = new mongoose.Types.ObjectId();
    await makeSubscription(SubscriptionStatus.CANCELLED, shopId);
    await expect(
      assertShopHasActiveSubscription(shopId),
    ).resolves.toBeUndefined();
  });

  it("throws for a cancelled subscription whose paid period has ended", async () => {
    const shopId = new mongoose.Types.ObjectId();
    const sub = await makeSubscription(SubscriptionStatus.CANCELLED, shopId);
    await Subscriptions.findByIdAndUpdate(sub._id, {
      currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    // The other direction — without this, a gate that admitted every
    // CANCELLED row would pass the test above and give service away forever.
    await expect(assertShopHasActiveSubscription(shopId)).rejects.toThrow(
      NotAllowedError,
    );
  });

  it("throws when status is expired", async () => {
    const shopId = new mongoose.Types.ObjectId();
    await makeSubscription(SubscriptionStatus.EXPIRED, shopId);
    await expect(assertShopHasActiveSubscription(shopId)).rejects.toThrow(
      NotAllowedError,
    );
  });

  // ACTIVE used to be admitted regardless of the clock, so a subscription
  // whose payment quietly stopped kept trading forever. It is now gated, but
  // with a grace window, because Paymob's renewal webhook is what advances
  // currentPeriodEnd and that message is not guaranteed to arrive — see
  // ACTIVE_GRACE_PERIOD_MS in models/Subscription.ts. Both directions are
  // asserted here as well as at the predicate level, because this is the layer
  // that actually decides whether a restaurant can take an order.
  it("admits an active subscription inside the grace window after its period", async () => {
    const shopId = new mongoose.Types.ObjectId();
    const sub = await makeSubscription(SubscriptionStatus.ACTIVE, shopId);
    await Subscriptions.findByIdAndUpdate(sub._id, {
      currentPeriodEnd: new Date(Date.now() - ACTIVE_GRACE_PERIOD_MS / 2),
    });

    await expect(
      assertShopHasActiveSubscription(shopId),
    ).resolves.toBeUndefined();
  });

  it("throws for an active subscription once the grace window has passed", async () => {
    const shopId = new mongoose.Types.ObjectId();
    const sub = await makeSubscription(SubscriptionStatus.ACTIVE, shopId);
    await Subscriptions.findByIdAndUpdate(sub._id, {
      currentPeriodEnd: new Date(
        Date.now() - ACTIVE_GRACE_PERIOD_MS - 24 * 60 * 60 * 1000,
      ),
    });

    await expect(assertShopHasActiveSubscription(shopId)).rejects.toThrow(
      NotAllowedError,
    );
  });

  it("tells a lapsed subscription that it expired, not that it has none", async () => {
    // The message matters: a shop whose row still says "active" being told
    // "No active subscription found for user" is both wrong and unactionable.
    // SUBSCRIPTION_EXPIRED is the one that says how to fix it.
    const shopId = new mongoose.Types.ObjectId();
    const sub = await makeSubscription(SubscriptionStatus.ACTIVE, shopId);
    await Subscriptions.findByIdAndUpdate(sub._id, {
      currentPeriodEnd: new Date(
        Date.now() - ACTIVE_GRACE_PERIOD_MS - 24 * 60 * 60 * 1000,
      ),
    });

    await expect(assertShopHasActiveSubscription(shopId)).rejects.toThrow(
      errMsg.SUBSCRIPTION_EXPIRED.en,
    );
  });

  it("still tells a pending subscription there is no active subscription", async () => {
    // The other direction of the message change: PENDING was never paid for,
    // so it must not be told its subscription "expired" however old the row
    // is. Without this, broadening the lapsed branch to every status would
    // pass the test above unnoticed.
    const shopId = new mongoose.Types.ObjectId();
    const sub = await makeSubscription(SubscriptionStatus.PENDING, shopId);
    await Subscriptions.findByIdAndUpdate(sub._id, {
      currentPeriodEnd: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    });

    await expect(assertShopHasActiveSubscription(shopId)).rejects.toThrow(
      errMsg.NO_ACTIVE_SUBSCRIPTION.en,
    );
  });
});
