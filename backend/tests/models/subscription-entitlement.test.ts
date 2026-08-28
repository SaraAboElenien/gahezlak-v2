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
  ACTIVE_GRACE_PERIOD_MS,
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
/** Comfortably outside ACTIVE_GRACE_PERIOD_MS, whatever it is set to. */
const longPast = () => new Date(Date.now() - ACTIVE_GRACE_PERIOD_MS - 10 * DAY);

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

  it("admits a trial that is still running", () => {
    expect(
      isEntitledToService({
        status: SubscriptionStatus.TRIALING,
        currentPeriodEnd: future(),
      }),
    ).toBe(true);
  });

  /**
   * The bug this pins: TRIALING used to return `true` unconditionally, so a
   * free trial never ended. Nothing transitions `trialing` -> `expired` —
   * the only writer of EXPIRED is the Paymob "suspended" webhook, which
   * cannot fire for a trial that never converted to billing, and there is no
   * cron anywhere in this backend. The deployed shop was still taking orders
   * ten days past its trial end when this was found.
   *
   * Do NOT "fix" a failure here by relaxing the assertion — that restores an
   * unlimited free tier.
   *
   * This also pins the asymmetry with ACTIVE below: `past()` is one day ago,
   * which is *inside* ACTIVE_GRACE_PERIOD_MS. If the grace window were ever
   * extended to TRIALING, this test fails.
   */
  it("refuses a trial whose period has ended", () => {
    expect(
      isEntitledToService({
        status: SubscriptionStatus.TRIALING,
        currentPeriodEnd: past(),
      }),
    ).toBe(false);
  });

  it("refuses a cancelled subscription past its paid period", () => {
    // Same asymmetry guard as the trial case above: one day past, which the
    // ACTIVE grace window would still admit. Cancellation dates are known in
    // advance and nothing external moves them, so they get no grace.
    expect(
      isEntitledToService({
        status: SubscriptionStatus.CANCELLED,
        currentPeriodEnd: past(),
      }),
    ).toBe(false);
  });

  /**
   * The bug these pin, and why the ACTIVE branch is graced rather than hard.
   *
   * ACTIVE used to return `true` unconditionally — the same shape as the
   * TRIALING bug above. A subscription whose payment quietly stopped kept full
   * access forever, because nothing in this codebase re-examines the clock and
   * there is no scheduler of any kind.
   *
   * It is graced because `currentPeriodEnd` is advanced for ACTIVE rows by an
   * *external* event, Paymob's renewal webhook, and three paths in that
   * handler return early after the customer has already been charged. Both
   * directions are asserted: this project once shipped an allowlist that was
   * only tested in the deny direction and silently stripped two fields from
   * every shop update while still returning 200.
   */
  it("admits an active subscription inside the grace window after its period", () => {
    expect(
      isEntitledToService({
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: new Date(Date.now() - ACTIVE_GRACE_PERIOD_MS / 2),
      }),
    ).toBe(true);
  });

  it("refuses an active subscription once the grace window has passed", () => {
    expect(
      isEntitledToService({
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: longPast(),
      }),
    ).toBe(false);
  });

  it("puts the active cutoff exactly one grace period behind now", () => {
    // Pins the boundary itself, so widening or narrowing the window is a
    // deliberate edit to ACTIVE_GRACE_PERIOD_MS rather than an accident in the
    // comparison. `now` is injected so this cannot flake on a slow machine.
    const now = new Date("2026-08-28T12:00:00.000Z");
    const cutoff = new Date(now.getTime() - ACTIVE_GRACE_PERIOD_MS);

    const check = (currentPeriodEnd: Date) =>
      isEntitledToService(
        { status: SubscriptionStatus.ACTIVE, currentPeriodEnd },
        now,
      );

    expect(check(new Date(cutoff.getTime() + 1000))).toBe(true);
    // Strictly greater than, matching the `$gt` the Mongo filter uses.
    expect(check(cutoff)).toBe(false);
    expect(check(new Date(cutoff.getTime() - 1000))).toBe(false);
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
    // `shop` is `unique: true` on the model, so these rows cannot share one
    // shop the way this fixture originally had them — that combination is
    // unrepresentable in production. Each row gets its own shop and the query
    // is scoped by the created ids instead.
    const rows = [
      { status: SubscriptionStatus.ACTIVE, currentPeriodEnd: future() },
      // The two ACTIVE clock cases. The grace window is the one place these
      // encodings could drift apart silently, because only the predicate can
      // express it as arithmetic on the period end — the filter has to shift
      // the cutoff instead, and those are only equal algebraically.
      {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: new Date(Date.now() - ACTIVE_GRACE_PERIOD_MS / 2),
      },
      { status: SubscriptionStatus.ACTIVE, currentPeriodEnd: longPast() },
      { status: SubscriptionStatus.TRIALING, currentPeriodEnd: future() },
      // The expired trial: absent from this table, the two encodings could
      // disagree about it and no test would notice.
      { status: SubscriptionStatus.TRIALING, currentPeriodEnd: past() },
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
    // Entitled: ACTIVE/future, ACTIVE/inside-grace, TRIALING/future,
    // CANCELLED/future.
    expect(matchedIds.size).toBe(4);
  });
});
