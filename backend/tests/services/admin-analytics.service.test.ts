import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import {
  connectTestDB,
  disconnectTestDB,
  clearTestDB,
} from "../db-test-helper";
import { Plans } from "../../models/Plan";
import { Shops } from "../../models/Shop";
import { Orders, OrderStatus } from "../../models/Order";
import {
  getTotalPlatformRevenue,
  getRevenueGrowthRate,
  getTopPerformingRestaurants,
} from "../../services/admin-analytics.service";
import { getPlatformTimeZoneOffsetMs } from "../../utils/report-date-window";
import {
  PaymentTransactions,
  PaymentTransactionKind,
} from "../../models/PaymentTransaction";
import { recordSettledTransaction } from "../../services/payment-ledger.service";

/**
 * The admin analytics service answers three questions for the platform owner:
 * how much money the platform made, whether that number is going up, and which
 * restaurants are carrying it. All three feed charts on `/admin` — so a wrong
 * number here is not a crash, it is a confidently-drawn lie, which is strictly
 * worse. Nothing else in the app cross-checks these figures.
 *
 * Deliberately NOT mocked: Mongo. Two of the three functions are aggregations,
 * and the failure this file was written to hunt for is a *driver* behaviour
 * rather than a control-flow one — `$match` does no schema casting, so a value
 * that arrives in the wrong shape from a query string matches nothing at all,
 * silently and forever. A mocked model cannot reproduce that. It found one:
 * see the `getTopPerformingRestaurants` date-filter tests below.
 *
 * Note that `routes/admin.routes.ts` mounts all three endpoints with **no
 * validator**, so every string these functions receive is raw user input.
 * Several tests below exist only because of that.
 */

let seq = 0;
const nextSeq = () => ++seq;

async function seedPlan(price: number) {
  return Plans.create({
    planGroup: "Starter",
    title: `Plan ${nextSeq()}`,
    description: "Test plan",
    frequency: "monthly",
    currency: "EGP",
    price,
    paymobPlanId: 1000 + nextSeq(),
    features: ["QR menu"],
    trialPeriodDays: 14,
    isActive: true,
  });
}

// shops.name carries a unique index that survives clearTestDB(), so every
// fixture needs a distinct name.
async function seedShop(name?: string) {
  const n = nextSeq();
  return Shops.create({
    name: name ?? `Shop ${n}`,
    type: "restaurant",
    address: { country: "EG", city: "Cairo", street: "1 Main St" },
    phoneNumber: "01000000000",
    email: `shop${n}@example.com`,
    ownerId: new mongoose.Types.ObjectId(),
  });
}

async function seedOrder(opts: {
  shopId: mongoose.Types.ObjectId;
  totalAmount: number;
  orderStatus?: OrderStatus;
  createdAt?: Date;
}) {
  const order = await Orders.create({
    shopId: opts.shopId,
    orderNumber: nextSeq(),
    customerFirstName: "Cust",
    customerLastName: "Omer",
    customerPhoneNumber: "01000000000",
    orderStatus: opts.orderStatus ?? OrderStatus.Delivered,
    totalAmount: opts.totalAmount,
    orderItems: [
      {
        menuItem: new mongoose.Types.ObjectId(),
        quantity: 1,
        price: opts.totalAmount,
      },
    ],
  });

  if (opts.createdAt) {
    // Enabling `timestamps` makes Mongoose mark `createdAt` immutable, so a
    // model-level update silently drops it (and a test that believes it
    // back-dated an order would then assert against today's date instead).
    // Go through the raw driver, which applies no schema rules.
    await Orders.collection.updateOne(
      { _id: order._id },
      { $set: { createdAt: opts.createdAt } },
    );
  }

  return order;
}

/**
 * A settled charge in the ledger. Revenue is now read from here rather than
 * re-derived from subscription state, so this is what the revenue tests seed.
 */
async function seedLedger(opts: {
  amount: number;
  kind?: PaymentTransactionKind;
  settledAt?: Date;
  planId?: mongoose.Types.ObjectId;
  shopId?: mongoose.Types.ObjectId;
}) {
  return PaymentTransactions.create({
    kind: opts.kind ?? PaymentTransactionKind.SUBSCRIPTION_INITIAL,
    shopId: opts.shopId ?? new mongoose.Types.ObjectId(),
    planId: opts.planId,
    amount: opts.amount,
    // paymobTransactionId is uniquely indexed, so every fixture needs its own.
    paymobTransactionId: 700000 + nextSeq(),
    settledAt: opts.settledAt ?? new Date("2026-08-15T12:00:00.000Z"),
  });
}

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearTestDB();
});
/**
 * REWRITTEN 2026-08-29 for the settled-transaction ledger (ADR-018).
 *
 * These tests used to seed subscriptions and assert over their plan prices.
 * That is no longer what the function reads, and the change is not cosmetic:
 * the old behaviour derived revenue from *current state*, so editing a plan's
 * price rewrote history and a still-running subscription counted for nothing.
 * The old suite encoded that second point as a CHARACTERISATION test
 * asserting the wrong answer on purpose; it is inverted into a real
 * assertion below.
 */
describe("getTotalPlatformRevenue", () => {
  it("sums subscription charges that settled inside the window", async () => {
    await seedLedger({ amount: 299 });
    await seedLedger({
      amount: 599,
      kind: PaymentTransactionKind.SUBSCRIPTION_RENEWAL,
    });

    await expect(getTotalPlatformRevenue("", "")).resolves.toBe(898);
  });

  it("EXCLUDES order payments - that money belongs to the restaurant, not the platform", async () => {
    // The single most damaging way to get this wrong. Order payments dwarf
    // subscription income, so counting them would overstate the platform by
    // roughly the entire GMV, and the number would still look plausible.
    await seedLedger({ amount: 299 });
    await seedLedger({ amount: 100000, kind: PaymentTransactionKind.ORDER });

    await expect(getTotalPlatformRevenue("", "")).resolves.toBe(299);
  });

  it("counts a subscription charge that settled in the window even though the subscription is still running", async () => {
    // THE HEADLINE FIX. Under the old containment filter this returned 0: a
    // monthly subscription renewed on the 1st has `currentPeriodEnd` in the
    // following month, so "revenue in August" excluded every subscription
    // that was actually alive in August - i.e. all the real ones. A
    // settlement date is a fact about a transaction and does not move, so the
    // question stops arising rather than being answered better.
    await seedLedger({
      amount: 299,
      settledAt: new Date("2026-08-15T10:00:00.000Z"),
    });

    await expect(
      getTotalPlatformRevenue("2026-08-01", "2026-08-31"),
    ).resolves.toBe(299);
  });

  it("does not rewrite history when a plan's price changes afterwards", async () => {
    // The old implementation read `plan.price` at query time, so raising a
    // plan's price retroactively inflated every past month that plan had
    // appeared in. The ledger stores the amount actually charged.
    const plan = await seedPlan(299);
    await seedLedger({ amount: 299, planId: plan._id });

    await Plans.updateOne({ _id: plan._id }, { $set: { price: 4999 } });

    await expect(getTotalPlatformRevenue("", "")).resolves.toBe(299);
  });

  it("counts a redelivered webhook once, not twice", async () => {
    // Paymob retries any webhook it did not get a 200 for.
    // `paymobTransactionId` is uniquely indexed precisely so a redelivery
    // cannot inflate revenue, and `recordSettledTransaction` swallows the
    // resulting duplicate-key error rather than surfacing it.
    const twice = {
      kind: PaymentTransactionKind.SUBSCRIPTION_RENEWAL,
      shopId: new mongoose.Types.ObjectId(),
      amount: 299,
      paymobTransactionId: 999111,
      settledAt: new Date("2026-08-15"),
    };
    await recordSettledTransaction(twice);
    await recordSettledTransaction(twice);

    await expect(getTotalPlatformRevenue("", "")).resolves.toBe(299);
    await expect(PaymentTransactions.countDocuments()).resolves.toBe(1);
  });

  it("returns 0, not NaN, when nothing has ever settled", async () => {
    const total = await getTotalPlatformRevenue("", "");

    expect(total).toBe(0);
    expect(Number.isNaN(total)).toBe(false);
  });

  it("ignores the date filter entirely unless BOTH dates are supplied", async () => {
    await seedLedger({ amount: 299, settledAt: new Date("2020-01-15") });

    // The guard is `startDate && endDate`, so a half-specified range is a
    // no-op rather than a half-filter.
    await expect(getTotalPlatformRevenue("2026-01-01", "")).resolves.toBe(299);
    await expect(getTotalPlatformRevenue("", "2026-01-01")).resolves.toBe(299);
  });

  it("excludes a charge that settled outside the window", async () => {
    await seedLedger({ amount: 299, settledAt: new Date("2026-08-15") });

    await expect(
      getTotalPlatformRevenue("2026-09-01", "2026-09-30"),
    ).resolves.toBe(0);
  });

  it("includes a charge that settled later on the final Cairo day of the window", async () => {
    // The window closes at the start of the *next* Cairo day, not at UTC
    // midnight on the named one. Getting this wrong silently drops the whole
    // final day of every report - a bug this project has already shipped.
    await seedLedger({
      amount: 299,
      settledAt: new Date("2026-08-31T09:00:00.000Z"),
    });

    await expect(
      getTotalPlatformRevenue("2026-08-01", "2026-08-31"),
    ).resolves.toBe(299);
  });

  it("excludes a charge that settled only after the window's final Cairo day", async () => {
    // The "still excludes something" half, so the test above cannot pass by
    // simply matching everything.
    const cairoOffsetMs = getPlatformTimeZoneOffsetMs(
      new Date("2026-09-01T00:00:00.000Z"),
    );
    const windowEndUtc = new Date(Date.UTC(2026, 8, 1) - cairoOffsetMs);

    await seedLedger({
      amount: 299,
      settledAt: new Date(windowEndUtc.getTime() + 1),
    });

    await expect(
      getTotalPlatformRevenue("2026-08-01", "2026-08-31"),
    ).resolves.toBe(0);
  });

  it("rejects an unparseable date instead of failing deep inside the driver", async () => {
    await seedLedger({ amount: 299 });

    // The admin routes carry no validator, so this is reachable from the wire.
    await expect(
      getTotalPlatformRevenue("not-a-date", "2026-08-31"),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("recordSettledTransaction", () => {
  it("never throws when the insert fails, because the money has already moved", async () => {
    // The caller is a webhook handler that has already activated a
    // subscription or confirmed an order. Failing it would make Paymob retry
    // a handler that is not idempotent, in order to protect a reporting row.
    // Losing the row is the lesser harm, so the failure is logged, not raised.
    await expect(
      recordSettledTransaction({
        kind: PaymentTransactionKind.SUBSCRIPTION_RENEWAL,
        shopId: new mongoose.Types.ObjectId(),
        // `amount` is `min: 0`, so a negative value fails schema validation.
        amount: -1,
        paymobTransactionId: 555000,
        settledAt: new Date(),
      }),
    ).resolves.toBeUndefined();

    await expect(PaymentTransactions.countDocuments()).resolves.toBe(0);
  });

  it("defaults the currency to EGP rather than leaving it unset", async () => {
    await recordSettledTransaction({
      kind: PaymentTransactionKind.SUBSCRIPTION_INITIAL,
      shopId: new mongoose.Types.ObjectId(),
      amount: 299,
      paymobTransactionId: 555001,
      settledAt: new Date(),
    });

    const row = await PaymentTransactions.findOne({
      paymobTransactionId: 555001,
    });
    expect(row?.currency).toBe("EGP");
  });
});

/**
 * Growth is computed from two calls to getTotalPlatformRevenue, so these
 * seed the ledger rather than subscriptions. The dates that used to be a
 * subscription period are now a single settlement instant, which is the
 * whole point of ADR-018: a charge belongs to the window it settled in,
 * not to whichever window happens to contain a billing period.
 */
describe("getRevenueGrowthRate", () => {
  const emptyWindow = ["2020-01-01", "2020-01-02"] as const;

  it("reports 100% growth when the earlier period earned nothing and the later one earned something", async () => {
    await seedLedger({ amount: 299, settledAt: new Date("2026-08-01") });

    const growth = await getRevenueGrowthRate(
      ...emptyWindow,
      "2026-08-01",
      "2026-08-31",
    );

    expect(growth).toBe(100);
  });

  it("reports 0% — not NaN — when both periods earned nothing", async () => {
    const growth = await getRevenueGrowthRate(
      ...emptyWindow,
      "2020-02-01",
      "2020-02-02",
    );

    expect(growth).toBe(0);
    expect(Number.isNaN(growth)).toBe(false);
  });

  it("computes a positive growth percentage between two funded periods", async () => {
    await seedLedger({ amount: 200, settledAt: new Date("2026-07-02") });
    await seedLedger({ amount: 300, settledAt: new Date("2026-08-02") });

    const growth = await getRevenueGrowthRate(
      "2026-07-01",
      "2026-07-31",
      "2026-08-01",
      "2026-08-31",
    );

    expect(growth).toBeCloseTo(50, 5); // 200 -> 300
  });

  it("reports a negative percentage when revenue falls", async () => {
    await seedLedger({ amount: 400, settledAt: new Date("2026-07-02") });
    await seedLedger({ amount: 100, settledAt: new Date("2026-08-02") });

    const growth = await getRevenueGrowthRate(
      "2026-07-01",
      "2026-07-31",
      "2026-08-01",
      "2026-08-31",
    );

    expect(growth).toBeCloseTo(-75, 5); // 400 -> 100
  });

  it("reports -100% when a funded period is followed by an empty one", async () => {
    await seedLedger({ amount: 400, settledAt: new Date("2026-07-02") });

    const growth = await getRevenueGrowthRate(
      "2026-07-01",
      "2026-07-31",
      "2026-08-01",
      "2026-08-31",
    );

    expect(growth).toBe(-100);
  });
});

describe("getTopPerformingRestaurants", () => {
  it("ranks shops by delivered-order revenue, highest first, with the shop name attached", async () => {
    const quiet = await seedShop("Quiet Cafe");
    const busy = await seedShop("Busy Grill");
    await seedOrder({
      shopId: quiet._id,
      totalAmount: 50,
      createdAt: new Date("2026-08-10"),
    });
    await seedOrder({
      shopId: busy._id,
      totalAmount: 300,
      createdAt: new Date("2026-08-10"),
    });
    await seedOrder({
      shopId: busy._id,
      totalAmount: 200,
      createdAt: new Date("2026-08-11"),
    });

    const top = await getTopPerformingRestaurants(
      5,
      "2026-08-01",
      "2026-08-20",
    );

    expect(top).toEqual([
      {
        shopId: busy._id,
        shopName: "Busy Grill",
        totalShopRevenue: 500,
      },
      {
        shopId: quiet._id,
        shopName: "Quiet Cafe",
        totalShopRevenue: 50,
      },
    ]);
  });

  it("counts only Delivered orders — pending, cancelled and in-flight orders are not revenue", async () => {
    const shop = await seedShop("Half Finished");
    const window = { createdAt: new Date("2026-08-10") };
    await seedOrder({ shopId: shop._id, totalAmount: 100, ...window });
    for (const orderStatus of [
      OrderStatus.Pending,
      OrderStatus.Confirmed,
      OrderStatus.Preparing,
      OrderStatus.Ready,
      OrderStatus.Cancelled,
    ]) {
      await seedOrder({
        shopId: shop._id,
        totalAmount: 999,
        orderStatus,
        ...window,
      });
    }

    const top = await getTopPerformingRestaurants(
      5,
      "2026-08-01",
      "2026-08-20",
    );

    expect(top).toHaveLength(1);
    expect(top[0].totalShopRevenue).toBe(100);
  });

  it("never mixes one tenant's revenue into another's row", async () => {
    const shopA = await seedShop("Tenant A");
    const shopB = await seedShop("Tenant B");
    await seedOrder({
      shopId: shopA._id,
      totalAmount: 100,
      createdAt: new Date("2026-08-10"),
    });
    await seedOrder({
      shopId: shopB._id,
      totalAmount: 700,
      createdAt: new Date("2026-08-10"),
    });

    const top = await getTopPerformingRestaurants(
      5,
      "2026-08-01",
      "2026-08-20",
    );

    const byName = Object.fromEntries(
      top.map((row) => [row.shopName, row.totalShopRevenue]),
    );
    expect(byName).toEqual({ "Tenant A": 100, "Tenant B": 700 });
  });

  it("honours the limit, keeping the highest earners", async () => {
    for (const [name, amount] of [
      ["Third", 30],
      ["First", 300],
      ["Second", 100],
    ] as const) {
      const shop = await seedShop(name);
      await seedOrder({
        shopId: shop._id,
        totalAmount: amount,
        createdAt: new Date("2026-08-10"),
      });
    }

    const top = await getTopPerformingRestaurants(
      2,
      "2026-08-01",
      "2026-08-20",
    );

    expect(top.map((row) => row.shopName)).toEqual(["First", "Second"]);
  });

  it("narrows to the requested window", async () => {
    const shop = await seedShop("Seasonal");
    await seedOrder({
      shopId: shop._id,
      totalAmount: 100,
      createdAt: new Date("2026-07-15"),
    });
    await seedOrder({
      shopId: shop._id,
      totalAmount: 40,
      createdAt: new Date("2026-08-15"),
    });

    const august = await getTopPerformingRestaurants(
      5,
      "2026-08-01",
      "2026-08-31",
    );

    expect(august).toEqual([
      { shopId: shop._id, shopName: "Seasonal", totalShopRevenue: 40 },
    ]);
  });

  it("returns [] when there are no orders at all", async () => {
    await expect(
      getTopPerformingRestaurants(5, "2026-08-01", "2026-08-31"),
    ).resolves.toEqual([]);
  });

  /**
   * REGRESSION. `adminAnalyticsApi.getTopRestaurants` takes `startDate` and
   * `endDate` as optional and omits the query string entirely when they are
   * absent; the controller then passes `undefined` straight through.
   *
   * `new Date(undefined)` is an Invalid Date, and an Invalid Date inside a
   * `$match` matches **nothing** — no error, no warning, an empty chart. The
   * sibling function in this same file already guarded with
   * `if (startDate && endDate)`; this one did not, so the platform's
   * top-restaurants ranking was unconditionally empty for any caller that
   * omitted the range.
   */
  it("treats omitted dates as 'no date filter', not as 'match nothing'", async () => {
    const shop = await seedShop("Always Open");
    await seedOrder({
      shopId: shop._id,
      totalAmount: 120,
      createdAt: new Date("2026-08-10"),
    });

    const top = await getTopPerformingRestaurants(
      5,
      undefined as unknown as string,
      undefined as unknown as string,
    );

    expect(top).toEqual([
      { shopId: shop._id, shopName: "Always Open", totalShopRevenue: 120 },
    ]);
  });

  it("treats empty-string dates as 'no date filter' too", async () => {
    const shop = await seedShop("Blank Range");
    await seedOrder({
      shopId: shop._id,
      totalAmount: 75,
      createdAt: new Date("2026-08-10"),
    });

    await expect(getTopPerformingRestaurants(5, "", "")).resolves.toEqual([
      { shopId: shop._id, shopName: "Blank Range", totalShopRevenue: 75 },
    ]);
  });

  it("rejects an unparseable date rather than silently reporting an empty ranking", async () => {
    const shop = await seedShop("Real Data");
    await seedOrder({
      shopId: shop._id,
      totalAmount: 120,
      createdAt: new Date("2026-08-10"),
    });

    await expect(
      getTopPerformingRestaurants(5, "2026-08-01", "not-a-date"),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  /**
   * REGRESSION (was a CHARACTERISATION pinning the defect — fixed 2026-08-29).
   *
   * `$lookup` + `$unwind` without `preserveNullAndEmptyArrays` is an inner
   * join, because `$unwind` over an empty array DROPS the document. Revenue
   * belonging to a shop whose document has since been deleted therefore
   * vanished from the ranking entirely, and the admin saw a total that did not
   * reconcile with the orders actually in the database — silently, and in the
   * flattering direction where nobody files a bug.
   *
   * Failing to *name* a deleted shop is acceptable; failing to *count* its
   * money is not. The row now survives with a null name.
   */
  it("keeps revenue whose shop document no longer exists, rather than dropping it", async () => {
    const ghost = new mongoose.Types.ObjectId();
    const live = await seedShop("Still Here");
    await seedOrder({
      shopId: ghost,
      totalAmount: 900,
      createdAt: new Date("2026-08-10"),
    });
    await seedOrder({
      shopId: live._id,
      totalAmount: 10,
      createdAt: new Date("2026-08-10"),
    });

    const top = await getTopPerformingRestaurants(
      5,
      "2026-08-01",
      "2026-08-20",
    );

    // Ordered by revenue, so the orphaned 900 leads.
    expect(top).toEqual([
      { shopId: ghost, shopName: null, totalShopRevenue: 900 },
      { shopId: live._id, shopName: "Still Here", totalShopRevenue: 10 },
    ]);
  });

  /**
   * REGRESSION (was a DEFECT — the same calendar-day truncation as
   * `getTotalPlatformRevenue`, fixed 2026-08-24). "2026-08-31" now means the
   * whole Cairo calendar day, so an order placed on the afternoon of the
   * last day of the window is included rather than falling after a
   * UTC-midnight cutoff.
   */
  it("includes an order placed later on the final Cairo day of the window", async () => {
    const shop = await seedShop("Last Day");
    await seedOrder({
      shopId: shop._id,
      totalAmount: 500,
      createdAt: new Date("2026-08-31T13:00:00.000Z"),
    });

    await expect(
      getTopPerformingRestaurants(5, "2026-08-01", "2026-08-31"),
    ).resolves.toEqual([
      { shopId: shop._id, shopName: "Last Day", totalShopRevenue: 500 },
    ]);
  });

  /**
   * The precise edge, computed from the real IANA offset rather than a
   * hardcoded "+2" or "+3" assumption — Egypt observes DST (UTC+3
   * roughly May-October, UTC+2 otherwise), so which literal UTC hour the
   * Cairo day-boundary falls on shifts with the calendar, and a test that
   * hardcodes one would start lying twice a year. `getPlatformTimeZoneOffsetMs`
   * is the same primitive `report-date-window.ts` itself uses, so this pins
   * the *contract* (half-open window in PLATFORM_TIMEZONE) rather than
   * today's specific offset.
   */
  describe("Cairo day-boundary precision", () => {
    it("includes an order 1ms before the Cairo day boundary and excludes one exactly on it", async () => {
      const shop = await seedShop("Boundary Shop");

      // Cairo midnight of 2026-09-01 — the exclusive close of the window
      // requested as endDate "2026-08-31".
      const cairoOffsetMs = getPlatformTimeZoneOffsetMs(
        new Date("2026-09-01T00:00:00.000Z"),
      );
      const windowEndUtc = Date.UTC(2026, 8, 1) - cairoOffsetMs;

      await seedOrder({
        shopId: shop._id,
        totalAmount: 111,
        createdAt: new Date(windowEndUtc - 1),
      });
      await seedOrder({
        shopId: shop._id,
        totalAmount: 999,
        createdAt: new Date(windowEndUtc),
      });

      await expect(
        getTopPerformingRestaurants(5, "2026-08-01", "2026-08-31"),
      ).resolves.toEqual([
        { shopId: shop._id, shopName: "Boundary Shop", totalShopRevenue: 111 },
      ]);
    });

    it("excludes an order exactly at the Cairo day-boundary start and includes one 1ms later", async () => {
      const shop = await seedShop("Start Boundary Shop");

      // Cairo midnight of 2026-08-01 — the inclusive open of the window
      // requested as startDate "2026-08-01".
      const cairoOffsetMs = getPlatformTimeZoneOffsetMs(
        new Date("2026-08-01T00:00:00.000Z"),
      );
      const windowStartUtc = Date.UTC(2026, 7, 1) - cairoOffsetMs;

      await seedOrder({
        shopId: shop._id,
        totalAmount: 222,
        createdAt: new Date(windowStartUtc - 1),
      });
      await seedOrder({
        shopId: shop._id,
        totalAmount: 333,
        createdAt: new Date(windowStartUtc),
      });

      await expect(
        getTopPerformingRestaurants(5, "2026-08-01", "2026-08-31"),
      ).resolves.toEqual([
        {
          shopId: shop._id,
          shopName: "Start Boundary Shop",
          totalShopRevenue: 333,
        },
      ]);
    });
  });
});
