import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import {
  connectTestDB,
  disconnectTestDB,
  clearTestDB,
} from "../db-test-helper";
import { Subscriptions, SubscriptionStatus } from "../../models/Subscription";
import { Plans } from "../../models/Plan";
import { Shops } from "../../models/Shop";
import { Orders, OrderStatus } from "../../models/Order";
import {
  getTotalPlatformRevenue,
  getRevenueGrowthRate,
  getTopPerformingRestaurants,
} from "../../services/admin-analytics.service";
import { getPlatformTimeZoneOffsetMs } from "../../utils/report-date-window";

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

async function seedSubscription(opts: {
  price?: number;
  status?: SubscriptionStatus;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  /** Point `plan` at nothing, to exercise the unpopulated branch. */
  danglingPlan?: boolean;
}) {
  const plan = opts.danglingPlan
    ? new mongoose.Types.ObjectId()
    : (await seedPlan(opts.price ?? 299))._id;
  const shop = await seedShop();

  return Subscriptions.create({
    userId: new mongoose.Types.ObjectId(),
    shop: shop._id,
    plan,
    status: opts.status ?? SubscriptionStatus.ACTIVE,
    currentPeriodStart: opts.currentPeriodStart ?? new Date("2026-08-01"),
    currentPeriodEnd: opts.currentPeriodEnd ?? new Date("2026-08-29"),
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

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearTestDB();
});

describe("getTotalPlatformRevenue", () => {
  it("sums the plan price of every active subscription", async () => {
    await seedSubscription({ price: 299 });
    await seedSubscription({ price: 599 });

    await expect(getTotalPlatformRevenue("", "")).resolves.toBe(898);
  });

  it("counts only `active` subscriptions — trialing, pending, cancelled and expired are not revenue", async () => {
    await seedSubscription({ price: 299, status: SubscriptionStatus.ACTIVE });
    await seedSubscription({
      price: 1000,
      status: SubscriptionStatus.TRIALING,
    });
    await seedSubscription({ price: 2000, status: SubscriptionStatus.PENDING });
    await seedSubscription({
      price: 4000,
      status: SubscriptionStatus.CANCELLED,
    });
    await seedSubscription({ price: 8000, status: SubscriptionStatus.EXPIRED });

    await expect(getTotalPlatformRevenue("", "")).resolves.toBe(299);
  });

  it("returns 0, not NaN, when there are no subscriptions at all", async () => {
    const total = await getTotalPlatformRevenue("", "");

    expect(total).toBe(0);
    expect(Number.isNaN(total)).toBe(false);
  });

  it("scores a dangling plan reference as 0 rather than NaN", async () => {
    // populate() resolves a missing reference to null. Reading `.price` off it
    // unguarded would put NaN into the platform revenue figure — and NaN is
    // contagious, so one orphaned subscription would erase the whole number.
    await seedSubscription({ price: 500 });
    await seedSubscription({ danglingPlan: true });

    const total = await getTotalPlatformRevenue("", "");

    expect(total).toBe(500);
    expect(Number.isNaN(total)).toBe(false);
  });

  it("ignores the date filter entirely unless BOTH dates are supplied", async () => {
    await seedSubscription({
      price: 299,
      currentPeriodStart: new Date("2020-01-01"),
      currentPeriodEnd: new Date("2020-01-31"),
    });

    // Only one half of the range: the guard is `startDate && endDate`, so a
    // half-specified range is silently a no-op rather than a half-filter.
    await expect(getTotalPlatformRevenue("2026-01-01", "")).resolves.toBe(299);
    await expect(getTotalPlatformRevenue("", "2026-01-01")).resolves.toBe(299);
  });

  it("includes a subscription whose period sits exactly on the requested calendar-day boundaries", async () => {
    // `currentPeriodStart` sits exactly on the inclusive UTC-midnight start
    // of "2026-08-01", and `currentPeriodEnd` at UTC midnight on
    // "2026-08-31" is well before the window's real (Cairo, exclusive)
    // close — see the Cairo-day-boundary tests below for the precise edge.
    await seedSubscription({
      price: 299,
      currentPeriodStart: new Date("2026-08-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-08-31T00:00:00.000Z"),
    });

    await expect(
      getTotalPlatformRevenue("2026-08-01", "2026-08-31"),
    ).resolves.toBe(299);
  });

  it("excludes a subscription whose period falls outside the window", async () => {
    await seedSubscription({
      price: 299,
      currentPeriodStart: new Date("2026-08-05"),
      currentPeriodEnd: new Date("2026-08-20"),
    });

    await expect(
      getTotalPlatformRevenue("2026-09-01", "2026-09-30"),
    ).resolves.toBe(0);
  });

  /**
   * DEFECT (characterised, deliberately not changed here — see the report).
   *
   * The window filter is *containment*, not *overlap*: it demands
   * `currentPeriodStart >= start AND currentPeriodEnd <= end`. A monthly
   * subscription that renewed on the 1st has `currentPeriodEnd` in the *next*
   * month, so asking "how much revenue in August" excludes every subscription
   * that is still running — i.e. all of the live ones. The number the admin
   * dashboard shows for the current month is therefore ~0 by construction.
   *
   * Changing it to overlap semantics is a product decision about what
   * "revenue in a window" means for a subscription that straddles it, so this
   * test pins the behaviour rather than asserting the desired one.
   */
  it("CHARACTERISATION: containment semantics exclude a subscription that is still running at the window end", async () => {
    await seedSubscription({
      price: 299,
      currentPeriodStart: new Date("2026-08-01"),
      currentPeriodEnd: new Date("2026-09-01"), // renews next month
    });

    await expect(
      getTotalPlatformRevenue("2026-08-01", "2026-08-31"),
    ).resolves.toBe(0);
  });

  /**
   * REGRESSION (was a DEFECT — see TECH_DEBT.md and DECISIONS.md, fixed
   * 2026-08-24). The frontend sends calendar dates (`formatDateYMD` →
   * "2026-08-31"). The window is now computed as a half-open
   * PLATFORM_TIMEZONE ("Africa/Cairo") range — [start-of-Cairo-day,
   * start-of-next-Cairo-day) — rather than `new Date("2026-08-31")`
   * (midnight UTC) compared with `$lte`, so a period ending later on the
   * final *Cairo* day is included instead of being cut off at the very
   * start of that day.
   */
  it("includes a subscription whose period ends later on the final Cairo day of the window", async () => {
    await seedSubscription({
      price: 299,
      currentPeriodStart: new Date("2026-08-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-08-31T09:00:00.000Z"), // same Cairo day, later
    });

    await expect(
      getTotalPlatformRevenue("2026-08-01", "2026-08-31"),
    ).resolves.toBe(299);
  });

  it("excludes a subscription whose period ends only after the window's final Cairo day", async () => {
    // The window for endDate "2026-08-31" now closes at the start of the
    // *next* Cairo calendar day (2026-09-01 00:00 Africa/Cairo). A period
    // ending after that instant is genuinely outside the window, not a
    // truncation bug — this is the "still excludes something" half of the
    // fix, so the test can't pass by simply matching everything.
    const cairoOffsetMs = getPlatformTimeZoneOffsetMs(
      new Date("2026-09-01T00:00:00.000Z"),
    );
    const windowEndUtc = new Date(Date.UTC(2026, 8, 1) - cairoOffsetMs);
    const justAfterWindowEnd = new Date(windowEndUtc.getTime() + 1);

    await seedSubscription({
      price: 299,
      currentPeriodStart: new Date("2026-08-01T00:00:00.000Z"),
      currentPeriodEnd: justAfterWindowEnd,
    });

    await expect(
      getTotalPlatformRevenue("2026-08-01", "2026-08-31"),
    ).resolves.toBe(0);
  });

  it("rejects an unparseable date instead of failing deep inside the driver", async () => {
    await seedSubscription({ price: 299 });

    // The admin routes carry no validator, so this is reachable from the wire.
    // Before the fix this surfaced as a raw Mongoose CastError — a 500 whose
    // message names an internal schema path.
    await expect(
      getTotalPlatformRevenue("not-a-date", "2026-08-31"),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("getRevenueGrowthRate", () => {
  const emptyWindow = ["2020-01-01", "2020-01-02"] as const;

  it("reports 100% growth when the earlier period earned nothing and the later one earned something", async () => {
    await seedSubscription({
      price: 299,
      currentPeriodStart: new Date("2026-08-01"),
      currentPeriodEnd: new Date("2026-08-20"),
    });

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
    await seedSubscription({
      price: 200,
      currentPeriodStart: new Date("2026-07-02"),
      currentPeriodEnd: new Date("2026-07-20"),
    });
    await seedSubscription({
      price: 300,
      currentPeriodStart: new Date("2026-08-02"),
      currentPeriodEnd: new Date("2026-08-20"),
    });

    const growth = await getRevenueGrowthRate(
      "2026-07-01",
      "2026-07-31",
      "2026-08-01",
      "2026-08-31",
    );

    expect(growth).toBeCloseTo(50, 5); // 200 -> 300
  });

  it("reports a negative percentage when revenue falls", async () => {
    await seedSubscription({
      price: 400,
      currentPeriodStart: new Date("2026-07-02"),
      currentPeriodEnd: new Date("2026-07-20"),
    });
    await seedSubscription({
      price: 100,
      currentPeriodStart: new Date("2026-08-02"),
      currentPeriodEnd: new Date("2026-08-20"),
    });

    const growth = await getRevenueGrowthRate(
      "2026-07-01",
      "2026-07-31",
      "2026-08-01",
      "2026-08-31",
    );

    expect(growth).toBeCloseTo(-75, 5); // 400 -> 100
  });

  it("reports -100% when a funded period is followed by an empty one", async () => {
    await seedSubscription({
      price: 400,
      currentPeriodStart: new Date("2026-07-02"),
      currentPeriodEnd: new Date("2026-07-20"),
    });

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
   * CHARACTERISATION. `$lookup` + `$unwind` (without
   * `preserveNullAndEmptyArrays`) is an inner join: revenue belonging to a shop
   * whose document has since been deleted vanishes from the platform total
   * rather than showing as "Unknown". Pinned so a future change to the join is
   * a deliberate one.
   */
  it("CHARACTERISATION: drops revenue whose shop document no longer exists", async () => {
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

    expect(top).toEqual([
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
