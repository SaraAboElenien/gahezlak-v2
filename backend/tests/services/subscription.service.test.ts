import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import mongoose from "mongoose";
import type { Types } from "mongoose";
import {
  connectTestDB,
  disconnectTestDB,
  clearTestDB,
} from "../db-test-helper";
import { Subscriptions, SubscriptionStatus } from "../../models/Subscription";
import type { ISubscription } from "../../models/Subscription";
import { Plans } from "../../models/Plan";
import type { IPlan } from "../../models/Plan";
import { Shops } from "../../models/Shop";
import { Users } from "../../models/User";
import { errMsg } from "../../common/err-messages";
import { assertShopHasActiveSubscription } from "../../middlewares/subscription-check.middleware";

/**
 * The subscription service is the other half of the money path: the order
 * service decides what a *customer* pays a restaurant, this one decides what a
 * *restaurant* pays us — and, through `SubscriptionStatus`, whether that
 * restaurant may take orders at all. It had no tests.
 *
 * Two properties carry essentially all of the risk here.
 *
 * The first is `effectiveTrialDays`. The controller passes it straight to
 * `createSubscriptionIntent`, which uses it to pick which Paymob integration
 * runs the *first* transaction: > 0 selects the Verification integration
 * (authorise, then auto-void, so a free trial really is free), 0 selects the
 * ordinary card integration (a real charge). Getting that number wrong in one
 * direction charged every free-trial signup the full plan price on day one —
 * a real, shipped bug, fixed on 2026-08-05 — and in the other direction gives
 * a paid month away. Nothing downstream re-derives it, so this number is the
 * decision.
 *
 * The second is `status`. Entitlement is decided by `isEntitledToService`
 * (models/Subscription.ts) — ACTIVE, TRIALING, or CANCELLED while
 * `currentPeriodEnd` is still in the future — so every status written here is
 * an access-control decision as well as a billing one. In particular nothing
 * in this file may ever write TRIALING or ACTIVE: those are the webhook's to
 * write, once Paymob has confirmed a real transaction. Writing them earlier
 * would hand a free trial to anyone who merely opened a checkout page.
 *
 * Deliberately NOT mocked: Mongo. Several of the behaviours that matter most
 * (the shop-scoped upsert, what an `undefined` in `$set` actually does) are
 * properties of the driver rather than of this file's control flow, and a
 * mocked model cannot tell you about them. Only the Paymob boundary is stubbed.
 */

// The only external boundary the service touches. Left un-stubbed it would
// attempt a real HTTPS call to accept.paymob.com against whatever credentials
// happen to be in the environment — i.e. it could cancel a real subscription.
const cancelPaymobSubscriptionMock = vi.hoisted(() => vi.fn());
// Stubbed for the same reason, and for one more: `createSubscriptionIntent` is
// what actually starts billing a restaurant. The inactive-plan tests below
// drive the real controller, and a handler that got past the guard would
// otherwise open a live checkout.
const createSubscriptionIntentMock = vi.hoisted(() => vi.fn());
vi.mock("../../utils/paymob", () => ({
  cancelPaymobSubscription: cancelPaymobSubscriptionMock,
  createSubscriptionIntent: createSubscriptionIntentMock,
}));

const SHOP_A = new mongoose.Types.ObjectId();
const SHOP_B = new mongoose.Types.ObjectId();
const USER_A = new mongoose.Types.ObjectId();
const USER_B = new mongoose.Types.ObjectId();

const DAY = 24 * 60 * 60 * 1000;

// shops.name and users.email carry unique indexes, and the indexes survive
// clearTestDB(); a counter keeps every seeded fixture distinct.
let fixtureSeq = 0;
const nextSeq = () => ++fixtureSeq;

const subscriptionService = () => import("../../services/subscription.service");

/**
 * Two small typing shims, both papering over declarations that live outside
 * this file's scope rather than over anything this file does.
 *
 * `ISubscription` (models/Subscription.ts) does not declare `_id`, though every
 * document the service returns carries one; and `IUser` declares its `_id` as
 * `Schema.Types.ObjectId` rather than `Types.ObjectId`, which are structurally
 * different types even though the runtime value is the same. Both are worth
 * fixing at the model, which is why they are named here rather than hidden
 * behind an untyped cast.
 */
const idOf = (doc: ISubscription): Types.ObjectId =>
  (doc as unknown as { _id: Types.ObjectId })._id;
const asObjectId = (id: unknown): Types.ObjectId => id as Types.ObjectId;

async function seedPlan(overrides: Partial<IPlan> = {}): Promise<IPlan> {
  // `planGroup` varies per fixture for the same reason `shops.name` and
  // `users.email` do: (planGroup, frequency) now carries a unique index, so a
  // second plan seeded at "Starter"/"monthly" is a duplicate-key error rather
  // than a second plan. Nothing here asserts on the group — the tests that
  // care about a plan's identity assert on `_id`, `title` or `price` — so the
  // safe fixture is the distinct one.
  const n = nextSeq();
  const plan = await Plans.create({
    planGroup: `Starter ${n}`,
    title: `Starter monthly ${n}`,
    description: "Test plan",
    frequency: "monthly",
    currency: "EGP",
    price: 299,
    paymobPlanId: 11405,
    features: ["QR menu"],
    trialPeriodDays: 14,
    isActive: true,
    ...overrides,
  });
  // getPlanById() hands the controller a `.lean()` plan, so mirror a plain
  // object rather than a hydrated document.
  return plan.toObject();
}

async function seedSubscription(overrides: {
  shop?: Types.ObjectId;
  userId?: Types.ObjectId;
  plan?: Types.ObjectId;
  status?: SubscriptionStatus;
  isTrialUsed?: boolean;
  paymobSubscriptionId?: number;
  paymobTransactionId?: number;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelledAt?: Date;
  createdAt?: Date;
}) {
  const { createdAt, ...fields } = overrides;
  const subscription = await Subscriptions.create({
    shop: SHOP_A,
    userId: USER_A,
    plan: new mongoose.Types.ObjectId(),
    status: SubscriptionStatus.ACTIVE,
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * DAY),
    ...fields,
  });

  if (createdAt) {
    // timestamps:false so the plugin doesn't stomp the value straight back.
    await Subscriptions.findByIdAndUpdate(
      subscription._id,
      { createdAt },
      { timestamps: false },
    );
  }

  return subscription;
}

/**
 * A subscription with real `users`, `shops` and `plans` documents behind it.
 * getAllSubscriptions() `$lookup`s all three and then `$unwind`s them, so a
 * subscription whose references do not resolve behaves very differently from
 * one whose do — see the dangling-reference test.
 */
async function seedListableSubscription(
  opts: {
    status?: SubscriptionStatus;
    email?: string;
    shopName?: string;
    planTitle?: string;
    createdAt?: Date;
    // Needed since the cancellation grace period became part of "active":
    // for a CANCELLED row, whether it is still inside its paid period is the
    // whole question.
    currentPeriodEnd?: Date;
  } = {},
) {
  const n = nextSeq();
  const plan = await seedPlan({ title: opts.planTitle ?? `Plan ${n}` });
  const user = await Users.create({
    firstName: "Owner",
    lastName: `Number${n}`,
    email: opts.email ?? `owner${n}@example.com`,
    password: "irrelevant-hash",
    phoneNumber: "01000000000",
    role: new mongoose.Types.ObjectId(),
  });
  const shop = await Shops.create({
    name: opts.shopName ?? `Shop ${n}`,
    type: "restaurant",
    address: { country: "EG", city: "Cairo", street: "1 Main St" },
    phoneNumber: "01000000000",
    email: `shop${n}@example.com`,
    ownerId: user._id,
  });

  const subscription = await seedSubscription({
    shop: shop._id,
    userId: asObjectId(user._id),
    plan: plan._id,
    status: opts.status ?? SubscriptionStatus.ACTIVE,
    createdAt: opts.createdAt,
    // Spread only when set: `currentPeriodEnd: undefined` would override
    // seedSubscription's default rather than fall through to it, and the
    // field is required.
    ...(opts.currentPeriodEnd
      ? { currentPeriodEnd: opts.currentPeriodEnd }
      : {}),
  });

  return { subscription, user, shop, plan };
}

beforeAll(async () => {
  await connectTestDB();
  // Not optional. Mongoose builds indexes in the background, so without this
  // the unique (planGroup, frequency) index races the first inserts and the
  // fixtures above pass or fail on scheduling rather than on the constraint.
  // This project has already shipped a test that stayed green for weeks purely
  // by winning that race (tests/models/subscription-entitlement.test.ts,
  // 2026-08-24).
  await Plans.init();
});

afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  vi.clearAllMocks();
  cancelPaymobSubscriptionMock.mockResolvedValue({ success: true });
  createSubscriptionIntentMock.mockResolvedValue({
    iframeUrl: "https://accept.paymob.com/unified-checkout/?token=stub",
  });
});

describe("createOrUpdatePendingSubscription — trial eligibility", () => {
  it("grants the plan's full trial to a shop that has never subscribed", async () => {
    const { createOrUpdatePendingSubscription } = await subscriptionService();
    const plan = await seedPlan({ trialPeriodDays: 14 });

    const { subscription, effectiveTrialDays } =
      await createOrUpdatePendingSubscription({
        shopId: SHOP_A.toString(),
        userId: USER_A.toString(),
        plan,
      });

    // This number is the entire free-trial decision: the controller hands it to
    // createSubscriptionIntent, which sends the first transaction through the
    // authorise-and-void Verification integration when it is > 0 and through
    // the ordinary card integration when it is 0. A wrong 0 here charges 299
    // EGP to someone who was promised fourteen free days.
    expect(effectiveTrialDays).toBe(14);
    expect(subscription.isTrialUsed).toBe(true);

    const span =
      subscription.currentPeriodEnd.getTime() -
      subscription.currentPeriodStart.getTime();
    expect(Math.round(span / DAY)).toBe(14);
  });

  it("gives no trial on a plan that does not offer one", async () => {
    const { createOrUpdatePendingSubscription } = await subscriptionService();
    const plan = await seedPlan({ trialPeriodDays: 0 });

    const { subscription, effectiveTrialDays } =
      await createOrUpdatePendingSubscription({
        shopId: SHOP_A.toString(),
        userId: USER_A.toString(),
        plan,
      });

    expect(effectiveTrialDays).toBe(0);
    // Not merely cosmetic: `isTrialUsed` is the only record that a shop has
    // ever had a trial, and setting it here would burn a trial the shop never
    // received.
    expect(subscription.isTrialUsed).toBe(false);
    // A zero-length period, which is correct for now — the real billing period
    // is computed by the webhook once Paymob confirms the charge. Access is
    // gated on `status` alone, so nothing reads these dates in the meantime.
    expect(subscription.currentPeriodEnd.getTime()).toBe(
      subscription.currentPeriodStart.getTime(),
    );
  });

  it("leaves the subscription pending, so the shop gets nothing before Paymob confirms", async () => {
    const { createOrUpdatePendingSubscription } = await subscriptionService();
    const plan = await seedPlan({ trialPeriodDays: 14 });

    const { subscription } = await createOrUpdatePendingSubscription({
      shopId: SHOP_A.toString(),
      userId: USER_A.toString(),
      plan,
    });

    // TRIALING and ACTIVE belong to the webhook, which only writes them after a
    // real transaction. If this wrote TRIALING directly, opening the checkout
    // page and abandoning it would be worth fourteen free days — and the
    // service would then refuse to create the pending row on the next honest
    // attempt, because a TRIALING row already exists.
    expect(subscription.status).toBe(SubscriptionStatus.PENDING);
    await expect(assertShopHasActiveSubscription(SHOP_A)).rejects.toThrow();
  });

  it("does not hand a second trial to a shop whose trial record survives", async () => {
    const { createOrUpdatePendingSubscription } = await subscriptionService();
    const plan = await seedPlan({ trialPeriodDays: 14 });
    await seedSubscription({
      status: SubscriptionStatus.EXPIRED,
      isTrialUsed: true,
    });

    const { effectiveTrialDays } = await createOrUpdatePendingSubscription({
      shopId: SHOP_A.toString(),
      userId: USER_A.toString(),
      plan,
    });

    // One trial per shop, not one per subscription attempt.
    expect(effectiveTrialDays).toBe(0);
  });

  it("scopes trial eligibility to the shop, not globally", async () => {
    const { createOrUpdatePendingSubscription } = await subscriptionService();
    const plan = await seedPlan({ trialPeriodDays: 14 });
    await seedSubscription({
      shop: SHOP_B,
      userId: USER_B,
      status: SubscriptionStatus.EXPIRED,
      isTrialUsed: true,
    });

    const { effectiveTrialDays } = await createOrUpdatePendingSubscription({
      shopId: SHOP_A.toString(),
      userId: USER_A.toString(),
      plan,
    });

    // Another restaurant having used its trial must not deny this one its own.
    expect(effectiveTrialDays).toBe(14);
  });

  /**
   * DEFECT MARKER — do not delete; un-skip when the source is fixed.
   *
   * "Has this shop had a trial?" is answered by `findOne({ shop, isTrialUsed:
   * true })`, and the answer is then written back over the *same* row as
   * `isTrialUsed: isEligibleForTrial`. So the second subscription — correctly
   * refused a trial — also erases the evidence that the first one had one, and
   * the third subscription is judged trial-eligible again.
   *
   * A restaurant therefore gets a free 14 days on every *odd* subscription,
   * indefinitely, by letting the paid one lapse and re-subscribing. Both halves
   * of it look right in isolation, which is why it survives review: the gate
   * itself is correct, it is the write that destroys the gate's own input.
   *
   * The fix is not to widen the query — the row is upserted per shop, so there
   * is only ever one — but to stop clearing the flag: `isTrialUsed` should be
   * latched (`isTrialUsed: isEligibleForTrial || previousSubWithTrial != null`,
   * or simply omitted from the `$set` when the shop has already used one).
   */
  it("never hands out a second trial, however often the shop re-subscribes", async () => {
    const { createOrUpdatePendingSubscription } = await subscriptionService();
    const plan = await seedPlan({ trialPeriodDays: 14 });
    const subscribe = () =>
      createOrUpdatePendingSubscription({
        shopId: SHOP_A.toString(),
        userId: USER_A.toString(),
        plan,
      });
    const lapse = () =>
      Subscriptions.updateOne(
        { shop: SHOP_A },
        { $set: { status: SubscriptionStatus.EXPIRED } },
      );

    const first = await subscribe();
    await lapse();
    const second = await subscribe();
    await lapse();
    const third = await subscribe();

    expect(first.effectiveTrialDays).toBe(14);
    expect(second.effectiveTrialDays).toBe(0);
    expect(third.effectiveTrialDays).toBe(0);
  });
});

describe("createOrUpdatePendingSubscription — one live subscription per shop", () => {
  it.each([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING])(
    "refuses to start a new subscription while one is %s",
    async (status) => {
      const { createOrUpdatePendingSubscription } = await subscriptionService();
      const plan = await seedPlan();
      const existing = await seedSubscription({
        status,
        paymobSubscriptionId: 900001,
      });

      await expect(
        createOrUpdatePendingSubscription({
          shopId: SHOP_A.toString(),
          userId: USER_A.toString(),
          plan,
        }),
      ).rejects.toThrow(errMsg.USER_ALREADY_SUBSCRIBED.en);

      // The guard is what stops the upsert below it from overwriting a live,
      // Paymob-backed subscription with a pending one — which would revoke the
      // shop's access while Paymob carried on billing the card.
      const stored = await Subscriptions.findById(existing._id).lean();
      expect(stored?.status).toBe(status);
      expect(stored?.paymobSubscriptionId).toBe(900001);
      await expect(Subscriptions.countDocuments()).resolves.toBe(1);
    },
  );

  it("refuses while a cancelled subscription is still inside its paid period", async () => {
    const { createOrUpdatePendingSubscription } = await subscriptionService();
    const plan = await seedPlan();
    await seedSubscription({
      status: SubscriptionStatus.CANCELLED,
      currentPeriodEnd: new Date(Date.now() + 10 * DAY),
      cancelledAt: new Date(),
    });

    // A cancellation takes effect at period end, so the shop has already paid
    // for these ten days; letting it subscribe again now would charge it twice
    // for the same window.
    await expect(
      createOrUpdatePendingSubscription({
        shopId: SHOP_A.toString(),
        userId: USER_A.toString(),
        plan,
      }),
    ).rejects.toThrow(errMsg.USER_ALREADY_SUBSCRIBED.en);
  });

  it("allows re-subscribing once the cancelled period has run out", async () => {
    const { createOrUpdatePendingSubscription } = await subscriptionService();
    const plan = await seedPlan();
    await seedSubscription({
      status: SubscriptionStatus.CANCELLED,
      currentPeriodEnd: new Date(Date.now() - DAY),
      cancelledAt: new Date(Date.now() - 30 * DAY),
    });

    const { subscription } = await createOrUpdatePendingSubscription({
      shopId: SHOP_A.toString(),
      userId: USER_A.toString(),
      plan,
    });

    // The mirror image of the test above: past period end the cancellation is
    // spent, and a shop that cannot come back is a customer we cannot re-sell.
    expect(subscription.status).toBe(SubscriptionStatus.PENDING);
  });

  it("allows re-subscribing after the previous subscription expired", async () => {
    const { createOrUpdatePendingSubscription } = await subscriptionService();
    const plan = await seedPlan();
    await seedSubscription({ status: SubscriptionStatus.EXPIRED });

    const { subscription } = await createOrUpdatePendingSubscription({
      shopId: SHOP_A.toString(),
      userId: USER_A.toString(),
      plan,
    });

    expect(subscription.status).toBe(SubscriptionStatus.PENDING);
  });

  it("reuses the same row when a shop retries a payment that never completed", async () => {
    const { createOrUpdatePendingSubscription } = await subscriptionService();
    const plan = await seedPlan();
    const first = await seedSubscription({
      status: SubscriptionStatus.PENDING,
    });

    const { subscription } = await createOrUpdatePendingSubscription({
      shopId: SHOP_A.toString(),
      userId: USER_A.toString(),
      plan,
    });

    // The declined-card retry. `shop` is uniquely indexed, so inserting a
    // second row rather than updating the first would not merely duplicate
    // data — it would fail with a duplicate-key error and leave the shop
    // permanently unable to pay us.
    expect(subscription._id.toString()).toBe(first._id.toString());
    await expect(Subscriptions.countDocuments()).resolves.toBe(1);
  });

  it("is not blocked by another shop's live subscription", async () => {
    const { createOrUpdatePendingSubscription } = await subscriptionService();
    const plan = await seedPlan();
    await seedSubscription({
      shop: SHOP_B,
      userId: USER_B,
      status: SubscriptionStatus.ACTIVE,
    });

    const { subscription } = await createOrUpdatePendingSubscription({
      shopId: SHOP_A.toString(),
      userId: USER_A.toString(),
      plan,
    });

    expect(subscription.shop.toString()).toBe(SHOP_A.toString());
    await expect(Subscriptions.countDocuments()).resolves.toBe(2);
  });
});

describe("createOrUpdatePendingSubscription — re-subscribe hygiene", () => {
  it("re-points the row at the newly chosen plan and the acting user", async () => {
    const { createOrUpdatePendingSubscription } = await subscriptionService();
    const oldPlan = await seedPlan({ title: "Starter", price: 299 });
    const newPlan = await seedPlan({ title: "Pro", price: 799 });
    await seedSubscription({
      status: SubscriptionStatus.EXPIRED,
      plan: oldPlan._id,
      userId: USER_B,
    });

    const { subscription } = await createOrUpdatePendingSubscription({
      shopId: SHOP_A.toString(),
      userId: USER_A.toString(),
      plan: newPlan,
    });

    // An upgrade that kept pointing at the old plan would bill the shop 299 for
    // a 799 subscription — and `handleSubscriptionRenewed` reads the plan's
    // frequency off this reference to compute every future billing period.
    expect(subscription.plan.toString()).toBe(newPlan._id.toString());
    // Ownership follows the person who actually paid; the previous owner may no
    // longer even be on the shop.
    expect(subscription.userId.toString()).toBe(USER_A.toString());
  });

  /**
   * DEFECT MARKER — do not delete; un-skip when the source is fixed.
   *
   * The `$set` clears the previous Paymob linkage with `paymobSubscriptionId:
   * undefined`, `paymobTransactionId: undefined` and `cancelledAt: undefined`.
   * Mongoose ≥ 6 strips `undefined` keys out of an update rather than unsetting
   * the field (the `omitUndefined` option was removed), so all three survive
   * untouched. Verified against the real driver, not inferred: the write simply
   * does not happen.
   *
   * Consequences, in descending order of cost:
   *
   *  1. `handleSubscriptionCreated` bails out early with `if
   *     (subscription.paymobSubscriptionId) return;` — so the *new* Paymob
   *     subscription id is never stored. Every later cancel / suspend / resume
   *     / renewal webhook looks the subscription up by `paymobSubscriptionId`,
   *     and that id still belongs to the shop's previous subscription. The new
   *     one is then unreachable by webhook for its entire life: it never
   *     renews its period, never suspends on non-payment, never records a
   *     cancellation.
   *  2. `cancelSubscription` posts the *old* id to Paymob's cancel endpoint,
   *     so "cancel my subscription" leaves the live recurring mandate running.
   *  3. A stale `cancelledAt` sits on a subscription that is not cancelled.
   *
   * The fix is `$unset` (or `null`) for the three fields rather than
   * `undefined`.
   */
  it("clears the previous Paymob linkage when a shop re-subscribes", async () => {
    const { createOrUpdatePendingSubscription } = await subscriptionService();
    const plan = await seedPlan();
    await seedSubscription({
      status: SubscriptionStatus.EXPIRED,
      paymobSubscriptionId: 900002,
      paymobTransactionId: 800002,
      cancelledAt: new Date(Date.now() - 5 * DAY),
    });

    await createOrUpdatePendingSubscription({
      shopId: SHOP_A.toString(),
      userId: USER_A.toString(),
      plan,
    });

    const stored = await Subscriptions.findOne({ shop: SHOP_A }).lean();
    expect(stored?.paymobSubscriptionId).toBeUndefined();
    expect(stored?.paymobTransactionId).toBeUndefined();
    expect(stored?.cancelledAt).toBeUndefined();
  });
});

describe("cancelSubscription", () => {
  it("cancels at Paymob first, using the stored remote id, then locally", async () => {
    const { cancelSubscription } = await subscriptionService();
    const before = Date.now();
    const existing = await seedSubscription({
      status: SubscriptionStatus.ACTIVE,
      paymobSubscriptionId: 900003,
    });

    const result = await cancelSubscription(USER_A.toString());

    // Cancelling only locally is the expensive failure: the shop stops being
    // billed in our database while Paymob's recurring mandate keeps charging
    // the owner's card every month with nothing on our side to show for it.
    expect(cancelPaymobSubscriptionMock).toHaveBeenCalledExactlyOnceWith(
      900003,
    );
    expect(result.status).toBe(SubscriptionStatus.CANCELLED);

    const stored = await Subscriptions.findById(existing._id).lean();
    expect(stored?.status).toBe(SubscriptionStatus.CANCELLED);
    expect(stored?.cancelledAt?.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("does not call Paymob for a subscription that was never billed", async () => {
    const { cancelSubscription } = await subscriptionService();
    await seedSubscription({ status: SubscriptionStatus.PENDING });

    const result = await cancelSubscription(USER_A.toString());

    // A pending or trial subscription that never reached Paymob has no remote
    // id; posting `undefined` to /subscriptions/undefined/cancel would fail the
    // whole request and leave the shop unable to abandon a signup it never
    // completed.
    expect(cancelPaymobSubscriptionMock).not.toHaveBeenCalled();
    expect(result.status).toBe(SubscriptionStatus.CANCELLED);
  });

  it("leaves the local subscription untouched when Paymob refuses to cancel", async () => {
    const { cancelSubscription } = await subscriptionService();
    const existing = await seedSubscription({
      status: SubscriptionStatus.ACTIVE,
      paymobSubscriptionId: 900004,
    });
    cancelPaymobSubscriptionMock.mockRejectedValue(new Error("paymob down"));

    await expect(cancelSubscription(USER_A.toString())).rejects.toThrow();

    // Ordering is the whole guarantee here: the remote cancellation is awaited
    // before anything local is written, so a Paymob outage surfaces as a failed
    // request the owner can retry rather than as a subscription that looks
    // cancelled to us and live to Paymob.
    const stored = await Subscriptions.findById(existing._id).lean();
    expect(stored?.status).toBe(SubscriptionStatus.ACTIVE);
    expect(stored?.cancelledAt).toBeUndefined();
  });

  it.each([
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.TRIALING,
    SubscriptionStatus.PENDING,
    SubscriptionStatus.EXPIRED,
  ])("can cancel a subscription that is %s", async (status) => {
    const { cancelSubscription } = await subscriptionService();
    await seedSubscription({ status });

    await expect(cancelSubscription(USER_A.toString())).resolves.toMatchObject({
      status: SubscriptionStatus.CANCELLED,
    });
  });

  it("refuses when the caller has nothing left to cancel", async () => {
    const { cancelSubscription } = await subscriptionService();
    const { Errors } = await import("../../errors");
    await seedSubscription({
      status: SubscriptionStatus.CANCELLED,
      cancelledAt: new Date(Date.now() - DAY),
    });

    await expect(cancelSubscription(USER_A.toString())).rejects.toBeInstanceOf(
      Errors.NotFoundError,
    );

    // Re-cancelling must not move `cancelledAt` forward: it is the date the
    // grace period is reasoned about from.
    expect(cancelPaymobSubscriptionMock).not.toHaveBeenCalled();
  });

  it("refuses when the caller has no subscription at all", async () => {
    const { cancelSubscription } = await subscriptionService();

    await expect(cancelSubscription(USER_A.toString())).rejects.toThrow(
      errMsg.NO_ACTIVE_SUBSCRIPTION.en,
    );
  });

  it("will not let one user cancel another user's subscription", async () => {
    const { cancelSubscription } = await subscriptionService();
    const other = await seedSubscription({
      shop: SHOP_B,
      userId: USER_B,
      status: SubscriptionStatus.ACTIVE,
      paymobSubscriptionId: 900005,
    });

    // The handler passes the authenticated user's own id, so this is the check
    // standing between an authenticated shop owner and cancelling a competitor's
    // subscription — both locally and, via the mocked call, at Paymob.
    await expect(cancelSubscription(USER_A.toString())).rejects.toThrow();

    expect(cancelPaymobSubscriptionMock).not.toHaveBeenCalled();
    const stored = await Subscriptions.findById(other._id).lean();
    expect(stored?.status).toBe(SubscriptionStatus.ACTIVE);
  });

  /**
   * The lockout, fixed 2026-08-19. These assertions used to be inverted and
   * carried a "do not fix by changing the assertions" note, because the
   * behaviour was reported rather than resolved.
   *
   * Cancelling keeps `currentPeriodEnd` deliberately — the webhook's cancel
   * handler says the shop "can use service until period ends", and the
   * `SubscriptionStatus` enum says CANCELLED means "will expire at period
   * end". The gate disagreed and admitted only ACTIVE/TRIALING, so access died
   * the instant CANCELLED was written, while `createOrUpdatePendingSubscription`
   * still treated that same row as live and refused to sell a replacement. A
   * shop cancelling one day into a paid month spent the rest of it unable to
   * take a single order *and* unable to re-subscribe, money already taken.
   *
   * All three call sites now share `isEntitledToService`.
   */
  it("keeps both the paid period and access to it", async () => {
    const { cancelSubscription } = await subscriptionService();
    const periodEnd = new Date(Date.now() + 25 * DAY);
    await seedSubscription({
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: periodEnd,
      paymobSubscriptionId: 900006,
    });

    await cancelSubscription(USER_A.toString());

    const stored = await Subscriptions.findOne({ shop: SHOP_A }).lean();
    expect(stored?.status).toBe(SubscriptionStatus.CANCELLED);
    expect(stored?.currentPeriodEnd.getTime()).toBe(periodEnd.getTime());
    // Paid up for 25 more days, and able to trade for all of them.
    await expect(
      assertShopHasActiveSubscription(SHOP_A),
    ).resolves.toBeUndefined();
  });

  it("stops access once the cancelled period actually runs out", async () => {
    // The other half. A gate that admitted every CANCELLED row would pass the
    // test above and give away service indefinitely.
    await seedSubscription({
      status: SubscriptionStatus.CANCELLED,
      currentPeriodEnd: new Date(Date.now() - DAY),
      cancelledAt: new Date(Date.now() - 30 * DAY),
    });

    // SUBSCRIPTION_EXPIRED rather than NO_ACTIVE_SUBSCRIPTION: this shop has a
    // subscription and it ran out, which is a state it can fix by paying. The
    // middleware used to reserve that message for `status === EXPIRED` alone
    // and tell everyone else "No active subscription found for user" — untrue
    // here, and untrue of a lapsed ACTIVE row, which became reachable once
    // ACTIVE was gated on the clock.
    await expect(assertShopHasActiveSubscription(SHOP_A)).rejects.toThrow(
      errMsg.SUBSCRIPTION_EXPIRED.en,
    );
  });

  it("leaves a cancelled-but-paid shop able to trade and unable to double-pay", async () => {
    // The composed bug, walked end to end: these two rules are individually
    // reasonable and used to combine into "cannot use it, cannot replace it".
    const { cancelSubscription, createOrUpdatePendingSubscription } =
      await subscriptionService();
    const plan = await seedPlan();
    await seedSubscription({
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: new Date(Date.now() + 25 * DAY),
      paymobSubscriptionId: 900007,
    });

    await cancelSubscription(USER_A.toString());

    await expect(
      assertShopHasActiveSubscription(SHOP_A),
    ).resolves.toBeUndefined();
    // Still refused a second plan — they have already paid for this window,
    // and charging again for it is the failure in the other direction.
    await expect(
      createOrUpdatePendingSubscription({
        shopId: SHOP_A.toString(),
        userId: USER_A.toString(),
        plan,
      }),
    ).rejects.toThrow(errMsg.USER_ALREADY_SUBSCRIBED.en);
  });
});

describe("getUserActiveSubscription", () => {
  it.each([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING])(
    "returns a subscription that is %s",
    async (status) => {
      const { getUserActiveSubscription } = await subscriptionService();
      const { user } = await seedListableSubscription({ status });

      const found = await getUserActiveSubscription(user._id.toString());

      expect(found?.status).toBe(status);
    },
  );

  it("returns nothing for an expired subscription", async () => {
    const { getUserActiveSubscription } = await subscriptionService();
    const { user } = await seedListableSubscription({
      status: SubscriptionStatus.EXPIRED,
    });

    await expect(
      getUserActiveSubscription(user._id.toString()),
    ).resolves.toBeNull();
  });

  it("returns a cancelled subscription that is still inside its paid period", async () => {
    const { getUserActiveSubscription } = await subscriptionService();
    const { user } = await seedListableSubscription({
      status: SubscriptionStatus.CANCELLED,
      currentPeriodEnd: new Date(Date.now() + 10 * DAY),
    });

    // Previously null: this query had its own idea of "active" that ignored
    // the cancellation grace period, so a shop that had cancelled but was
    // still paid up saw no subscription at all in its dashboard while it went
    // on legitimately trading.
    const found = await getUserActiveSubscription(user._id.toString());

    expect(found?.status).toBe(SubscriptionStatus.CANCELLED);
  });

  it("returns nothing once the cancelled period has run out", async () => {
    const { getUserActiveSubscription } = await subscriptionService();
    const { user } = await seedListableSubscription({
      status: SubscriptionStatus.CANCELLED,
      currentPeriodEnd: new Date(Date.now() - DAY),
    });

    await expect(
      getUserActiveSubscription(user._id.toString()),
    ).resolves.toBeNull();
  });

  it("agrees with the access gate about an unpaid pending subscription", async () => {
    const { getUserActiveSubscription } = await subscriptionService();
    const { shop } = await seedListableSubscription({
      status: SubscriptionStatus.PENDING,
    });
    const { user } = await seedListableSubscription({
      status: SubscriptionStatus.PENDING,
    });

    // PENDING means "we wrote a row and sent the owner to Paymob's checkout
    // page", nothing more. This query used to admit it while the gate rejected
    // it, so a shop that opened checkout and closed it was told by its own
    // dashboard that it had a subscription while every gated action failed.
    // Both answers now come from one predicate.
    await expect(
      getUserActiveSubscription(user._id.toString()),
    ).resolves.toBeNull();
    await expect(assertShopHasActiveSubscription(shop._id)).rejects.toThrow();
  });

  it("populates the plan and shop the dashboard renders, without Paymob's internals", async () => {
    const { getUserActiveSubscription } = await subscriptionService();
    const { user, shop, plan } = await seedListableSubscription({
      planTitle: "Pro yearly",
    });

    const found = await getUserActiveSubscription(user._id.toString());
    const populatedPlan = found?.plan as IPlan;
    const populatedShop = found?.shop as { name: string };

    expect(populatedPlan.title).toBe("Pro yearly");
    expect(populatedShop.name).toBe(shop.name);
    // The projection is deliberately a whitelist. `paymobPlanId` is our own
    // billing-side identifier for the plan on Paymob and has no business being
    // serialised to a browser — it is exactly the sort of field that leaks by
    // default the day someone replaces the select string with a bare populate.
    expect(populatedPlan.paymobPlanId).toBeUndefined();
    expect(plan.paymobPlanId).toBe(11405);
  });

  it("is scoped to the requesting user", async () => {
    const { getUserActiveSubscription } = await subscriptionService();
    await seedListableSubscription({ status: SubscriptionStatus.ACTIVE });

    await expect(
      getUserActiveSubscription(new mongoose.Types.ObjectId().toString()),
    ).resolves.toBeNull();
  });
});

describe("getAllSubscriptions", () => {
  it("paginates while reporting the unpaginated total", async () => {
    const { getAllSubscriptions } = await subscriptionService();
    const base = Date.UTC(2026, 0, 1);
    for (let i = 0; i < 5; i++) {
      await seedListableSubscription({
        createdAt: new Date(base + i * 60_000),
      });
    }

    const page1 = await getAllSubscriptions({ page: 1, limit: 2 });
    const page3 = await getAllSubscriptions({ page: 3, limit: 2 });

    expect(page1.subscriptions).toHaveLength(2);
    expect(page3.subscriptions).toHaveLength(1);
    // totalCount drives the admin UI's page count, so it must ignore the page
    // window — but still respect the filters, which the count pipeline gets by
    // reusing every stage before the `$sort`.
    expect(page1.totalCount).toBe(5);
    expect(page3.totalCount).toBe(5);
  });

  it("sorts newest first", async () => {
    const { getAllSubscriptions } = await subscriptionService();
    const base = Date.UTC(2026, 0, 1);
    const oldest = await seedListableSubscription({
      createdAt: new Date(base),
    });
    const newest = await seedListableSubscription({
      createdAt: new Date(base + 60_000),
    });

    const { subscriptions } = await getAllSubscriptions({});

    expect(subscriptions.map((s) => idOf(s).toString())).toEqual([
      newest.subscription._id.toString(),
      oldest.subscription._id.toString(),
    ]);
  });

  it("filters by status, and counts the same set it returns", async () => {
    const { getAllSubscriptions } = await subscriptionService();
    await seedListableSubscription({ status: SubscriptionStatus.ACTIVE });
    await seedListableSubscription({ status: SubscriptionStatus.ACTIVE });
    await seedListableSubscription({ status: SubscriptionStatus.EXPIRED });

    const { subscriptions, totalCount } = await getAllSubscriptions({
      status: SubscriptionStatus.EXPIRED,
    });

    expect(subscriptions).toHaveLength(1);
    // Rows and count disagreeing is the quiet failure: the admin pages through
    // a total that does not describe what they were shown.
    expect(totalCount).toBe(1);
  });

  it.each([
    ["user email", (seeded: { user: { email: string } }) => seeded.user.email],
    ["shop name", (seeded: { shop: { name: string } }) => seeded.shop.name],
    ["plan title", (seeded: { plan: { title: string } }) => seeded.plan.title],
  ])("searches by %s", async (_label, pick) => {
    const { getAllSubscriptions } = await subscriptionService();
    const wanted = await seedListableSubscription({
      email: "findme@example.com",
      shopName: "Needle Bistro",
      planTitle: "Needle Pro",
    });
    await seedListableSubscription({
      email: "other@example.com",
      shopName: "Haystack Grill",
      planTitle: "Haystack Starter",
    });

    const { subscriptions, totalCount } = await getAllSubscriptions({
      search: pick(wanted).toUpperCase(),
    });

    // Upper-cased on the way in: the `$options: "i"` is what makes the admin
    // search usable at all, since none of the three fields is normalised.
    expect(subscriptions).toHaveLength(1);
    expect(totalCount).toBe(1);
    expect(idOf(subscriptions[0]).toString()).toBe(
      wanted.subscription._id.toString(),
    );
  });

  /**
   * STALE COMMENT CORRECTED 2026-08-29. This block previously read "CURRENT
   * BEHAVIOUR, not desired behaviour — reported, not fixed", claiming `search`
   * was interpolated straight into `$regex`. It is not, and was not when that
   * was written: `getAllSubscriptions` has passed the term through
   * `escapeRegex` since before this session. The old assertion — searching "."
   * and expecting both rows — could not tell the two apart, because every
   * seeded email contains a literal dot too.
   *
   * So the term is now a metacharacter that only a *regex* would match with,
   * and the expectation is that it matches nothing.
   */
  it("treats the search term as a literal, not a regular expression", async () => {
    const { getAllSubscriptions } = await subscriptionService();
    await seedListableSubscription({ email: "a@example.com" });
    await seedListableSubscription({ email: "b@example.com" });

    // Unescaped, `a.example` matches "a@example.com" — the `.` standing in for
    // the `@`. Escaped, it is a literal that appears in neither address.
    const asRegex = await getAllSubscriptions({ search: "a.example" });
    expect(asRegex.subscriptions).toHaveLength(0);
    expect(asRegex.totalCount).toBe(0);

    // The control: the ordinary case still finds its row, so the escape has
    // not simply broken searching.
    const asLiteral = await getAllSubscriptions({ search: "a@example.com" });
    expect(asLiteral.subscriptions).toHaveLength(1);
    expect(asLiteral.totalCount).toBe(1);
  });

  /**
   * REGRESSION — this test previously pinned the defect, under the name
   * "silently drops a subscription whose shop no longer exists".
   *
   * The pipeline `$lookup`s users, shops and plans and then `$unwind`s all
   * three. A bare `$unwind` is an inner join, so a subscription whose user,
   * shop or plan no longer resolved vanished from the admin list entirely —
   * and, because the count pipeline reuses every stage before the `$sort`,
   * from `totalCount` alongside it. The list stayed self-consistent and simply
   * under-reported, which is the dangerous shape: a revenue list missing rows
   * looks exactly like a correct one, where a row with a missing name does
   * not. The subscription remains billable throughout.
   *
   * `preserveNullAndEmptyArrays: true` on all three `$unwind`s makes them left
   * joins. Asserted for a deleted shop *and* a deleted plan, because the three
   * stages are separate and fixing one would not fix the others.
   */
  it("keeps a subscription whose shop or plan no longer exists", async () => {
    const { getAllSubscriptions } = await subscriptionService();
    const intact = await seedListableSubscription();
    const shopless = await seedListableSubscription();
    const planless = await seedListableSubscription();
    await Shops.deleteOne({ _id: shopless.shop._id });
    await Plans.deleteOne({ _id: planless.plan._id });

    const { subscriptions, totalCount } = await getAllSubscriptions({});

    expect(totalCount).toBe(3);
    expect(subscriptions.map((s) => idOf(s).toString()).sort()).toEqual(
      [intact, shopless, planless]
        .map((s) => s.subscription._id.toString())
        .sort(),
    );
    // The dangling reference is absent rather than nulled — that is what
    // `preserveNullAndEmptyArrays` does — so the admin UI renders a row with a
    // missing name instead of losing the row.
    const byId = new Map(subscriptions.map((s) => [idOf(s).toString(), s]));
    expect(
      byId.get(shopless.subscription._id.toString())!.shop,
    ).toBeUndefined();
    expect(
      byId.get(planless.subscription._id.toString())!.plan,
    ).toBeUndefined();
    expect(byId.get(intact.subscription._id.toString())!.shop).toBeDefined();
    // Still very much in the database, and still billable.
    await expect(Subscriptions.countDocuments()).resolves.toBe(3);
  });

  /**
   * STALE MARKER CORRECTED 2026-08-29. This carried a "DEFECT MARKER — un-skip
   * when the source is fixed" describing both filters as permanently broken.
   * The defect was real and is the reason the test exists: `userId` and
   * `planId` arrive as strings, `Model.aggregate()` performs no schema casting
   * (unlike `find()`), so an uncast `$match` compares a string against a stored
   * ObjectId and matches nothing, ever — returning `totalCount: 0` for correct
   * input, which reads as "this customer has no subscriptions" rather than as
   * an error. But `subscription.service.ts` has cast both through `toObjectId`
   * since before this session, and this test asserts the fixed behaviour; only
   * the comment was left behind. Kept as the regression test.
   */
  it("filters by userId and by planId", async () => {
    const { getAllSubscriptions } = await subscriptionService();
    const wanted = await seedListableSubscription();
    await seedListableSubscription();

    const byUser = await getAllSubscriptions({
      userId: wanted.user._id.toString(),
    });
    const byPlan = await getAllSubscriptions({
      planId: wanted.plan._id.toString(),
    });

    expect(byUser.subscriptions).toHaveLength(1);
    expect(byUser.totalCount).toBe(1);
    expect(byPlan.subscriptions).toHaveLength(1);
    expect(byPlan.totalCount).toBe(1);
  });

  it("returns an empty page and a zero total when nothing matches", async () => {
    const { getAllSubscriptions } = await subscriptionService();
    await seedListableSubscription({ status: SubscriptionStatus.ACTIVE });

    const { subscriptions, totalCount } = await getAllSubscriptions({
      search: "no-such-customer",
    });

    // `countResult[0]?.totalCount || 0` — an empty `$count` result yields no
    // documents at all, so the fallback is what stops the admin UI dividing by
    // undefined.
    expect(subscriptions).toHaveLength(0);
    expect(totalCount).toBe(0);
  });
});

describe("getSubscriptionById", () => {
  it("populates the owner, shop and plan an admin needs to act on a dispute", async () => {
    const { getSubscriptionById } = await subscriptionService();
    const { subscription, user, shop, plan } = await seedListableSubscription({
      planTitle: "Pro monthly",
    });

    const found = await getSubscriptionById(subscription._id.toString());
    const owner = found?.userId as unknown as { email: string };

    expect(owner.email).toBe(user.email);
    expect((found?.shop as { name: string }).name).toBe(shop.name);
    expect((found?.plan as IPlan).title).toBe(plan.title);
    // Same whitelist as the dashboard query: an admin view is still a browser.
    expect((found?.plan as IPlan).paymobPlanId).toBeUndefined();
  });

  it("returns null for an id that does not exist", async () => {
    const { getSubscriptionById } = await subscriptionService();

    // The controller turns null into a 404; anything else it gets, it doesn't
    // handle.
    await expect(
      getSubscriptionById(new mongoose.Types.ObjectId().toString()),
    ).resolves.toBeNull();
  });

  /**
   * REGRESSION — this test previously pinned the defect, asserting only that
   * *something* was thrown.
   *
   * A malformed id used to reach `findById` uncast, so Mongoose threw a
   * CastError. A CastError is not a `CustomError` and is not one of the shapes
   * the global error handler names, so the handler's "null means 404" path was
   * never taken and the middleware fell through to a 500 plus a Sentry event:
   * a mistyped id in the admin panel reported a server fault rather than a bad
   * request. `getSubscriptionById` now casts through the same `toObjectId`
   * helper the two `$match` filters use, and the route carries
   * `subscriptionIdParamValidator` besides — two layers answering two
   * different callers.
   *
   * The distinction the old assertion could not make is the whole point:
   * `rejects.toThrow()` passes for a CastError *and* for a typed 400, so it
   * would have stayed green through the bug and through the fix alike.
   */
  it("refuses a malformed id as a 400 rather than raising a 500", async () => {
    const { getSubscriptionById } = await subscriptionService();

    const err = await getSubscriptionById("not-an-object-id").then(
      () => null,
      (e: unknown) => e as { name: string; statusCode?: number },
    );

    expect(err).not.toBeNull();
    expect(err!.name).not.toBe("CastError");
    expect(err!.statusCode).toBe(400);
  });

  it("still returns the subscription for a well-formed id", async () => {
    // The other direction of the cast: a guard that rejected everything would
    // pass the test above and take the admin detail view down.
    const { getSubscriptionById } = await subscriptionService();
    const { subscription } = await seedListableSubscription();

    const found = await getSubscriptionById(subscription._id.toString());

    expect(idOf(found!).toString()).toBe(subscription._id.toString());
  });
});

/**
 * The controller, not the service, is where "this plan is no longer on sale"
 * has to be enforced — so it is tested here rather than left to the plan
 * service's listing tests, which only prove a retired plan is hidden.
 *
 * Hiding is not refusing. `getPlanById` deliberately still returns a
 * deactivated plan (an admin has to be able to fetch one in order to put it
 * back on sale), and `POST /subscriptions` takes a `planId` straight from the
 * request body — so before this guard, any link, bookmark or curl carrying a
 * retired plan's id still sold that plan, at a price we had stopped offering,
 * and `createSubscriptionIntent` opened a real Paymob checkout for it.
 */
describe("createSubscriptionHandler — plans that are no longer on sale", () => {
  const controller = () => import("../../controllers/subscription.controller");

  async function seedOwnerWithShop() {
    const n = nextSeq();
    const user = await Users.create({
      firstName: "Owner",
      lastName: `Number${n}`,
      email: `owner${n}@example.com`,
      password: "irrelevant-hash",
      phoneNumber: "01000000000",
      role: new mongoose.Types.ObjectId(),
      shop: new mongoose.Types.ObjectId(),
    });
    return user;
  }

  /**
   * Drives the real handler with the smallest request/response pair it reads.
   * The handler is `async` and throws rather than calling `next`, so the error
   * surfaces as a rejected promise — which is how the app's async error
   * middleware sees it too.
   */
  async function callHandler(userId: string, planId: string) {
    const { createSubscriptionHandler } = await controller();
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const invoke = createSubscriptionHandler as unknown as (
      req: unknown,
      res: unknown,
      next: unknown,
    ) => Promise<void>;

    const error = await invoke(
      { body: { planId }, user: { userId } },
      { status },
      vi.fn(),
    ).then(
      () => null,
      (e: unknown) => e as { message: string; statusCode?: number },
    );

    return { error, status, json };
  }

  it("refuses to sell a deactivated plan, and starts no checkout", async () => {
    const owner = await seedOwnerWithShop();
    const retired = await seedPlan({ isActive: false });

    const { error } = await callHandler(
      owner._id.toString(),
      retired._id.toString(),
    );

    expect(error?.message).toBe(errMsg.PLAN_INACTIVE.en);
    expect(error?.statusCode).toBe(400);
    // The two things that must not have happened: no pending row written
    // against the retired plan, and no Paymob intention created for it.
    await expect(Subscriptions.countDocuments()).resolves.toBe(0);
    expect(createSubscriptionIntentMock).not.toHaveBeenCalled();
  });

  it("still sells a plan that is on sale", async () => {
    // The other direction. A guard that refused everything would pass the test
    // above and take the entire subscribe flow down — and this project has
    // shipped exactly that shape of regression before (the `updateShop`
    // allowlist that silently stripped `type` and `logoUrl`).
    const owner = await seedOwnerWithShop();
    const live = await seedPlan({ isActive: true });

    const { error, status, json } = await callHandler(
      owner._id.toString(),
      live._id.toString(),
    );

    expect(error).toBeNull();
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { iframeUrl: expect.stringContaining("accept.paymob.com") },
      }),
    );
    expect(createSubscriptionIntentMock).toHaveBeenCalledTimes(1);
    // PENDING, not TRIALING or ACTIVE: the row exists only because the owner
    // was sent to checkout.
    const written = await Subscriptions.findOne({ plan: live._id }).lean();
    expect(written?.status).toBe(SubscriptionStatus.PENDING);
  });
});
