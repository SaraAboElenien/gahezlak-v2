import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import {
  connectTestDB,
  disconnectTestDB,
  clearTestDB,
} from "../db-test-helper";
import {
  Subscriptions,
  SubscriptionStatus,
  isEntitledToService,
  entitledToServiceFilter,
} from "../../models/Subscription";

/**
 * `isEntitledToService` is the single answer to "may this shop trade right
 * now". Three call sites used to answer it separately and disagreed, which
 * composed into a shop that had paid for a month, could not take an order for
 * any of it, and could not buy a replacement plan either.
 *
 * It exists in two encodings — an in-memory predicate and a Mongo filter —
 * because some callers hold a document and some can only query. Two encodings
 * of one rule is precisely how the original drift started, so the last test
 * here asserts they agree case for case rather than trusting that they do.
 */

const DAY = 24 * 60 * 60 * 1000;
const future = () => new Date(Date.now() + 10 * DAY);
const past = () => new Date(Date.now() - DAY);

describe("isEntitledToService", () => {
  it.each([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING])(
    "admits a %s subscription",
    (status) => {
      expect(isEntitledToService({ status, currentPeriodEnd: future() })).toBe(
        true,
      );
    },
  );

  it("admits a cancelled subscription still inside its paid period", () => {
    // Cancelling stops the renewal, not the month already paid for — which is
    // what both cancelSubscription and the SubscriptionStatus enum say.
    expect(
      isEntitledToService({
        status: SubscriptionStatus.CANCELLED,
        currentPeriodEnd: future(),
      }),
    ).toBe(true);
  });

  it("refuses a cancelled subscription past its paid period", () => {
    expect(
      isEntitledToService({
        status: SubscriptionStatus.CANCELLED,
        currentPeriodEnd: past(),
      }),
    ).toBe(false);
  });

  it("refuses a pending subscription even with time on the clock", () => {
    // PENDING means a row was written and the owner sent to checkout. Nothing
    // has been paid, so a future currentPeriodEnd must not buy access.
    expect(
      isEntitledToService({
        status: SubscriptionStatus.PENDING,
        currentPeriodEnd: future(),
      }),
    ).toBe(false);
  });

  it("refuses an expired subscription even with time on the clock", () => {
    expect(
      isEntitledToService({
        status: SubscriptionStatus.EXPIRED,
        currentPeriodEnd: future(),
      }),
    ).toBe(false);
  });

  it("refuses a missing subscription", () => {
    expect(isEntitledToService(null)).toBe(false);
    expect(isEntitledToService(undefined)).toBe(false);
  });
});

describe("entitledToServiceFilter agrees with isEntitledToService", () => {
  beforeAll(async () => {
    await connectTestDB();
    // Mongoose builds declared indexes in the background, so without this the
    // unique constraint on `shop` may or may not exist by the time the
    // inserts below run. That race is not hypothetical: this file inserted
    // six rows sharing one shop and passed only while the index build lost,
    // then began failing with E11000 the moment worker scheduling shifted.
    // Waiting for the indexes makes the schema the test runs against the same
    // one production runs against.
    await Subscriptions.init();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  it("selects exactly the rows the predicate admits", async () => {
    // `shop` is `unique: true` on the model, so these six rows cannot share
    // one shop the way this fixture originally had them — that combination is
    // unrepresentable in production. Each row gets its own shop and the query
    // is scoped by the created ids instead.
    const rows = [
      { status: SubscriptionStatus.ACTIVE, currentPeriodEnd: future() },
      { status: SubscriptionStatus.TRIALING, currentPeriodEnd: future() },
      { status: SubscriptionStatus.CANCELLED, currentPeriodEnd: future() },
      { status: SubscriptionStatus.CANCELLED, currentPeriodEnd: past() },
      { status: SubscriptionStatus.PENDING, currentPeriodEnd: future() },
      { status: SubscriptionStatus.EXPIRED, currentPeriodEnd: future() },
    ];

    const created = await Subscriptions.create(
      rows.map((r) => ({
        shop: new mongoose.Types.ObjectId(),
        userId: new mongoose.Types.ObjectId(),
        plan: new mongoose.Types.ObjectId(),
        currentPeriodStart: new Date(Date.now() - 5 * DAY),
        ...r,
      })),
    );

    const matched = await Subscriptions.find({
      _id: { $in: created.map((d) => d._id) },
      ...entitledToServiceFilter(),
    })
      .select("_id")
      .lean();
    const matchedIds = new Set(matched.map((m) => m._id.toString()));

    // Run against the real driver, not a hand-rolled comparison: `$gt` on a
    // Date and a JavaScript `>` are different implementations of the same
    // intent, and only one of them is what production actually executes.
    for (const doc of created) {
      expect(matchedIds.has(doc._id.toString())).toBe(isEntitledToService(doc));
    }
    // Sanity: the fixture set has to contain both answers, or the loop above
    // passes trivially against a filter that matches everything or nothing.
    expect(matchedIds.size).toBe(3);
  });
});
