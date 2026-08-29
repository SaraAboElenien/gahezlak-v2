import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import {
  connectTestDB,
  disconnectTestDB,
  clearTestDB,
} from "../db-test-helper";
import { Orders, OrderStatus } from "../../models/Order";
import { MenuItemModel } from "../../models/MenuItem";
import {
  CanceledOrderRate,
  OrderCountsByDate,
  SalesComparison,
  BestAndWorstSellers,
  totalRevenue,
} from "../../services/shop-analysis.service";
import { getPlatformTimeZoneOffsetMs } from "../../utils/report-date-window";

/**
 * Everything a restaurant owner sees on their analytics tab comes out of this
 * file. Two properties carry the risk.
 *
 * The first is **tenant isolation**. Every function here takes a `shopId` and
 * nothing else scopes the query — there is no per-tenant database, no row-level
 * policy, just this one argument. If a filter fails to narrow, a shop owner is
 * shown a competitor's revenue and never knows it, because the number still
 * looks plausible. Every function below is therefore tested with **two** shops
 * seeded, asserting shop B's money never appears in shop A's answer.
 *
 * That is not a hypothetical here. `$match` inside an aggregation does **no**
 * schema casting the way `find()` does, so a `shopId` that arrives as a hex
 * string (which is what a JWT carries) compared against an ObjectId field
 * matches nothing at all — silently, always. This project has already shipped
 * that exact bug twice elsewhere. These functions defend against it by calling
 * `new mongoose.Types.ObjectId(shopId)`, and the tests pass the *string* form
 * throughout precisely so that defence stays load-bearing rather than
 * decorative: delete the cast and the isolation tests do not merely leak, they
 * go empty.
 *
 * The second is **arithmetic over an empty shop**. Rates, averages and
 * percentage changes all divide, and a brand-new restaurant divides by zero.
 * NaN renders as "NaN%" in a chart and, worse, survives JSON as `null`.
 *
 * Deliberately NOT mocked: Mongo. Both properties are properties of the query
 * engine, not of this file's control flow.
 */

const SHOP_A = new mongoose.Types.ObjectId();
const SHOP_B = new mongoose.Types.ObjectId();

let seq = 0;
const nextSeq = () => ++seq;

async function seedOrder(opts: {
  shopId?: mongoose.Types.ObjectId;
  totalAmount?: number;
  orderStatus?: OrderStatus;
  createdAt?: Date;
  items?: Array<{ menuItem: mongoose.Types.ObjectId; quantity: number }>;
}) {
  const order = await Orders.create({
    shopId: opts.shopId ?? SHOP_A,
    orderNumber: nextSeq(),
    customerFirstName: "Cust",
    customerLastName: "Omer",
    customerPhoneNumber: "01000000000",
    orderStatus: opts.orderStatus ?? OrderStatus.Delivered,
    totalAmount: opts.totalAmount ?? 100,
    orderItems: (
      opts.items ?? [{ menuItem: new mongoose.Types.ObjectId(), quantity: 1 }]
    ).map((item) => ({ ...item, price: 10 })),
  });

  if (opts.createdAt) {
    // Enabling `timestamps` makes Mongoose mark `createdAt` immutable, so a
    // model-level update silently drops it — and a test that believed it
    // back-dated an order would then assert against today's date instead.
    // Go through the raw driver, which applies no schema rules.
    await Orders.collection.updateOne(
      { _id: order._id },
      { $set: { createdAt: opts.createdAt } },
    );
  }

  return order;
}

async function seedMenuItem(nameEn: string, shopId = SHOP_A) {
  const item = await MenuItemModel.create({
    shopId,
    name: { en: nameEn, ar: `${nameEn} بالعربية` },
    price: 50,
    categoryId: new mongoose.Types.ObjectId(),
  });

  // IMenuItem types `_id` as mongoose's schema-level `ObjectId`, which is not
  // assignable to `Types.ObjectId`. Narrow once here rather than at every use.
  // (Deliberately not the `.id` virtual — that is a hex *string*, and a string
  // in a `$match` against an ObjectId field is the silent no-match this whole
  // file exists to guard against.)
  return { id: item._id as unknown as mongoose.Types.ObjectId, name: nameEn };
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

describe("CanceledOrderRate", () => {
  it("computes the rate over this shop's orders only", async () => {
    await seedOrder({ shopId: SHOP_A, orderStatus: OrderStatus.Delivered });
    await seedOrder({ shopId: SHOP_A, orderStatus: OrderStatus.Delivered });
    await seedOrder({ shopId: SHOP_A, orderStatus: OrderStatus.Delivered });
    await seedOrder({ shopId: SHOP_A, orderStatus: OrderStatus.Cancelled });

    // Shop B is a disaster; none of it may reach shop A's dashboard.
    for (let i = 0; i < 10; i++) {
      await seedOrder({ shopId: SHOP_B, orderStatus: OrderStatus.Cancelled });
    }

    await expect(CanceledOrderRate(SHOP_A.toString())).resolves.toEqual({
      totalOrders: 4,
      canceledOrders: 1,
      cancellationRate: 25,
    });
  });

  it("reports shop B's own, different rate — the filter narrows in both directions", async () => {
    await seedOrder({ shopId: SHOP_A, orderStatus: OrderStatus.Delivered });
    await seedOrder({ shopId: SHOP_B, orderStatus: OrderStatus.Cancelled });
    await seedOrder({ shopId: SHOP_B, orderStatus: OrderStatus.Delivered });

    await expect(CanceledOrderRate(SHOP_B.toString())).resolves.toEqual({
      totalOrders: 2,
      canceledOrders: 1,
      cancellationRate: 50,
    });
  });

  it("returns 0 — not NaN — for a shop that has never taken an order", async () => {
    // 0/0. The guard here is the difference between "0%" and "NaN%" on a brand
    // new restaurant's very first look at its own dashboard.
    const result = await CanceledOrderRate(SHOP_A.toString());

    expect(result).toEqual({
      totalOrders: 0,
      canceledOrders: 0,
      cancellationRate: 0,
    });
    expect(Number.isNaN(result.cancellationRate)).toBe(false);
  });

  it("returns a number, rounded to two decimals, not a string", async () => {
    await seedOrder({ orderStatus: OrderStatus.Cancelled });
    await seedOrder({ orderStatus: OrderStatus.Delivered });
    await seedOrder({ orderStatus: OrderStatus.Delivered });

    const { cancellationRate } = await CanceledOrderRate(SHOP_A.toString());

    expect(cancellationRate).toBe(33.33);
    expect(typeof cancellationRate).toBe("number");
  });

  it("counts every non-cancelled status toward the denominator", async () => {
    for (const orderStatus of [
      OrderStatus.Pending,
      OrderStatus.Confirmed,
      OrderStatus.Preparing,
      OrderStatus.Ready,
      OrderStatus.Delivered,
    ]) {
      await seedOrder({ orderStatus });
    }
    await seedOrder({ orderStatus: OrderStatus.Cancelled });

    await expect(CanceledOrderRate(SHOP_A.toString())).resolves.toMatchObject({
      totalOrders: 6,
      canceledOrders: 1,
    });
  });
});

describe("OrderCountsByDate", () => {
  it("buckets a shop's orders by day, oldest first", async () => {
    await seedOrder({ createdAt: new Date("2026-03-02T10:00:00.000Z") });
    await seedOrder({ createdAt: new Date("2026-03-01T10:00:00.000Z") });
    await seedOrder({ createdAt: new Date("2026-03-01T18:00:00.000Z") });

    const counts = await OrderCountsByDate(SHOP_A.toString(), "daily");

    expect(counts).toEqual([
      { _id: { year: 2026, month: 3, day: 1 }, count: 2 },
      { _id: { year: 2026, month: 3, day: 2 }, count: 1 },
    ]);
  });

  it("buckets by month", async () => {
    await seedOrder({ createdAt: new Date("2026-01-05T10:00:00.000Z") });
    await seedOrder({ createdAt: new Date("2026-01-25T10:00:00.000Z") });
    await seedOrder({ createdAt: new Date("2026-02-05T10:00:00.000Z") });

    const counts = await OrderCountsByDate(SHOP_A.toString(), "monthly");

    expect(counts).toEqual([
      { _id: { year: 2026, month: 1 }, count: 2 },
      { _id: { year: 2026, month: 2 }, count: 1 },
    ]);
  });

  it("buckets by year", async () => {
    await seedOrder({ createdAt: new Date("2025-06-05T10:00:00.000Z") });
    await seedOrder({ createdAt: new Date("2026-06-05T10:00:00.000Z") });
    await seedOrder({ createdAt: new Date("2026-07-05T10:00:00.000Z") });

    const counts = await OrderCountsByDate(SHOP_A.toString(), "yearly");

    expect(counts).toEqual([
      { _id: { year: 2025 }, count: 1 },
      { _id: { year: 2026 }, count: 2 },
    ]);
  });

  /**
   * REGRESSION GUARD for the `$match`-does-not-cast class of bug. `shopId`
   * arrives as a hex *string* from the JWT; the field is an ObjectId. Without
   * the explicit `new mongoose.Types.ObjectId(shopId)` this returns [] for
   * every shop, forever, with no error.
   */
  it("narrows to one shop even though shopId arrives as a string", async () => {
    await seedOrder({
      shopId: SHOP_A,
      createdAt: new Date("2026-03-01T10:00:00.000Z"),
    });
    await seedOrder({
      shopId: SHOP_B,
      createdAt: new Date("2026-03-01T10:00:00.000Z"),
    });
    await seedOrder({
      shopId: SHOP_B,
      createdAt: new Date("2026-03-01T11:00:00.000Z"),
    });

    await expect(
      OrderCountsByDate(SHOP_A.toString(), "daily"),
    ).resolves.toEqual([{ _id: { year: 2026, month: 3, day: 1 }, count: 1 }]);
    await expect(
      OrderCountsByDate(SHOP_B.toString(), "daily"),
    ).resolves.toEqual([{ _id: { year: 2026, month: 3, day: 1 }, count: 2 }]);
  });

  it("returns [] for a shop with no orders", async () => {
    await seedOrder({ shopId: SHOP_B });

    await expect(
      OrderCountsByDate(SHOP_A.toString(), "daily"),
    ).resolves.toEqual([]);
  });

  /**
   * REGRESSION. `$year`/`$month`/`$dayOfMonth` bucket in **UTC** unless given a
   * `timezone`. Every shop on this platform is in Cairo (UTC+2/+3), so without
   * it the dinner rush that runs past local midnight was filed under the
   * previous day — not a rare edge for a restaurant, and it also made "today"
   * on this chart disagree with "today" in the orders list for the first hours
   * of every local morning.
   *
   * The instant is derived from the real IANA offset rather than a hardcoded
   * "+2"/"+3" (Egypt observes DST roughly May-October), using the same
   * primitive the report windows use — so this pins the *contract*, not
   * today's specific offset.
   */
  it("buckets by Cairo calendar day, so a post-midnight local order lands on the local day", async () => {
    // 30 minutes past Cairo midnight opening 2026-03-02, expressed in UTC.
    const cairoMidnightUtcMs =
      Date.UTC(2026, 2, 2) -
      getPlatformTimeZoneOffsetMs(new Date("2026-03-02T00:00:00.000Z"));
    await seedOrder({ createdAt: new Date(cairoMidnightUtcMs + 30 * 60_000) });

    const counts = await OrderCountsByDate(SHOP_A.toString(), "daily");

    expect(counts).toEqual([
      { _id: { year: 2026, month: 3, day: 2 }, count: 1 },
    ]);
  });

  /**
   * The same shift applies at a month and a year boundary, where it silently
   * moves trade into the wrong reporting period rather than merely the wrong
   * day. Both grouping modes take the timezone too; nothing here would fail if
   * only the `daily` branch had been fixed, so they are asserted separately.
   */
  it("buckets by Cairo calendar month and year at a New Year boundary", async () => {
    // 30 minutes past Cairo midnight opening 2026-01-01 — 2025-12-31 in UTC.
    const cairoNewYearUtcMs =
      Date.UTC(2026, 0, 1) -
      getPlatformTimeZoneOffsetMs(new Date("2026-01-01T00:00:00.000Z"));
    const justAfterMidnight = new Date(cairoNewYearUtcMs + 30 * 60_000);

    await seedOrder({ createdAt: justAfterMidnight });

    await expect(
      OrderCountsByDate(SHOP_A.toString(), "monthly"),
    ).resolves.toEqual([{ _id: { year: 2026, month: 1 }, count: 1 }]);
    await expect(
      OrderCountsByDate(SHOP_A.toString(), "yearly"),
    ).resolves.toEqual([{ _id: { year: 2026 }, count: 1 }]);
  });
});

describe("SalesComparison", () => {
  const july = [new Date("2026-07-01"), new Date("2026-07-31")] as const;
  const august = [new Date("2026-08-01"), new Date("2026-08-31")] as const;

  it("sums each window and reports the percentage change", async () => {
    await seedOrder({
      totalAmount: 200,
      createdAt: new Date("2026-07-10"),
    });
    await seedOrder({
      totalAmount: 300,
      createdAt: new Date("2026-08-10"),
    });

    await expect(
      SalesComparison(SHOP_A.toString(), ...july, ...august),
    ).resolves.toEqual({ total1: 200, total2: 300, percentageChange: 50 });
  });

  it("never counts another shop's sales", async () => {
    await seedOrder({
      shopId: SHOP_A,
      totalAmount: 100,
      createdAt: new Date("2026-07-10"),
    });
    await seedOrder({
      shopId: SHOP_B,
      totalAmount: 9000,
      createdAt: new Date("2026-07-10"),
    });
    await seedOrder({
      shopId: SHOP_B,
      totalAmount: 9000,
      createdAt: new Date("2026-08-10"),
    });

    await expect(
      SalesComparison(SHOP_A.toString(), ...july, ...august),
    ).resolves.toEqual({ total1: 100, total2: 0, percentageChange: -100 });
  });

  it("reports 0% — not NaN — when both windows are empty", async () => {
    const result = await SalesComparison(SHOP_A.toString(), ...july, ...august);

    expect(result).toEqual({ total1: 0, total2: 0, percentageChange: 0 });
    expect(Number.isNaN(result.percentageChange)).toBe(false);
  });

  it("reports 100% — not Infinity — when the first window is empty and the second is not", async () => {
    await seedOrder({ totalAmount: 500, createdAt: new Date("2026-08-10") });

    const result = await SalesComparison(SHOP_A.toString(), ...july, ...august);

    expect(result).toEqual({ total1: 0, total2: 500, percentageChange: 100 });
    expect(Number.isFinite(result.percentageChange)).toBe(true);
  });

  it("reports a negative percentage when sales fall", async () => {
    await seedOrder({ totalAmount: 400, createdAt: new Date("2026-07-10") });
    await seedOrder({ totalAmount: 100, createdAt: new Date("2026-08-10") });

    await expect(
      SalesComparison(SHOP_A.toString(), ...july, ...august),
    ).resolves.toMatchObject({ percentageChange: -75 });
  });

  it("includes orders sitting exactly on both window boundaries", async () => {
    await seedOrder({
      totalAmount: 10,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
    });
    await seedOrder({
      totalAmount: 20,
      createdAt: new Date("2026-07-31T00:00:00.000Z"),
    });

    await expect(
      SalesComparison(SHOP_A.toString(), ...july, ...august),
    ).resolves.toMatchObject({ total1: 30 });
  });

  /**
   * REGRESSION for the calendar-day truncation bug (fixed 2026-08-24, see
   * TECH_DEBT.md / DECISIONS.md). `july`/`august` above are exactly what the
   * real controller builds — `new Date("2026-07-31")` etc — so an order
   * placed later in the day on the last day of a window used to fall after
   * the UTC-midnight `$lte` cutoff. The window is now computed in
   * PLATFORM_TIMEZONE ("Africa/Cairo") from those Dates' UTC calendar date,
   * so this is included.
   */
  it("includes an order placed later on the final Cairo day of the window", async () => {
    await seedOrder({
      totalAmount: 40,
      createdAt: new Date("2026-07-31T13:00:00.000Z"),
    });

    await expect(
      SalesComparison(SHOP_A.toString(), ...july, ...august),
    ).resolves.toMatchObject({ total1: 40 });
  });

  /**
   * The precise edge, derived from the real IANA offset rather than a
   * hardcoded "+2"/"+3" assumption (Egypt observes DST roughly May-October).
   * `getPlatformTimeZoneOffsetMs` is the same primitive the service itself
   * uses, so this pins the half-open-window *contract*, not today's
   * specific offset.
   */
  it("excludes an order exactly at the Cairo day-boundary close and includes one 1ms earlier", async () => {
    // Cairo midnight of 2026-08-01 — the exclusive close of the window
    // requested via `july`'s end Date ("2026-07-31").
    const cairoOffsetMs = getPlatformTimeZoneOffsetMs(
      new Date("2026-08-01T00:00:00.000Z"),
    );
    const windowEndUtc = Date.UTC(2026, 7, 1) - cairoOffsetMs;

    await seedOrder({
      totalAmount: 55,
      createdAt: new Date(windowEndUtc - 1),
    });
    await seedOrder({
      totalAmount: 999,
      createdAt: new Date(windowEndUtc),
    });

    await expect(
      SalesComparison(SHOP_A.toString(), ...july, ...august),
    ).resolves.toMatchObject({ total1: 55 });
  });

  /**
   * REGRESSION for the two-numbers-one-dashboard bug. `SalesComparison` used
   * to apply **no status filter**, while `totalRevenue()` in this same file
   * deliberately excludes Cancelled and Pending — so the trend chart was
   * inflated by every order the kitchen refused and every order nobody has
   * paid for, and it could not be reconciled with the revenue figure printed
   * beside it.
   *
   * The assertion that matters is the *agreement*, not either number alone:
   * both are computed here over one set of orders and required to match.
   */
  it("agrees with totalRevenue() about what counts as a sale", async () => {
    await seedOrder({
      totalAmount: 100,
      orderStatus: OrderStatus.Delivered,
      createdAt: new Date("2026-07-10"),
    });
    await seedOrder({
      totalAmount: 60,
      orderStatus: OrderStatus.Cancelled,
      createdAt: new Date("2026-07-10"),
    });
    await seedOrder({
      totalAmount: 40,
      orderStatus: OrderStatus.Pending,
      createdAt: new Date("2026-07-10"),
    });

    const comparison = await SalesComparison(
      SHOP_A.toString(),
      ...july,
      ...august,
    );

    expect(comparison.total1).toBe(100);
    // The very same orders, through the other revenue function on this page.
    await expect(totalRevenue(SHOP_A.toString())).resolves.toBe(
      comparison.total1,
    );
  });

  /**
   * The other direction: every status that IS a sale still counts, so the
   * shared filter cannot be tightened into hiding real trade. Confirmed and
   * Preparing matter most — an order the kitchen is actively cooking is paid
   * for and is revenue, and dropping it would make the chart under-report at
   * exactly the busiest moment of the day.
   */
  it("counts every non-cancelled, non-pending status as a sale", async () => {
    for (const orderStatus of [
      OrderStatus.Confirmed,
      OrderStatus.Preparing,
      OrderStatus.Ready,
      OrderStatus.Delivered,
    ]) {
      await seedOrder({
        totalAmount: 25,
        orderStatus,
        createdAt: new Date("2026-07-10"),
      });
    }

    await expect(
      SalesComparison(SHOP_A.toString(), ...july, ...august),
    ).resolves.toMatchObject({ total1: 100 });
  });
});

describe("BestAndWorstSellers", () => {
  /**
   * The ample case — enough distinct dishes that the two ends of the ranking
   * cannot meet — where the disjointness rule below changes nothing at all.
   */
  it("ranks menu items by quantity sold, best descending and worst ascending", async () => {
    const sold: Record<string, number> = {
      Burger: 12,
      Pizza: 9,
      Wrap: 7,
      Soup: 4,
      Fries: 3,
      Salad: 1,
    };
    for (const [name, quantity] of Object.entries(sold)) {
      const item = await seedMenuItem(name);
      await seedOrder({ items: [{ menuItem: item.id, quantity }] });
    }

    const { bestSellers, worstSellers } = await BestAndWorstSellers(
      SHOP_A.toString(),
      3,
    );

    expect(bestSellers.map((row) => [row.name.en, row.total])).toEqual([
      ["Burger", 12],
      ["Pizza", 9],
      ["Wrap", 7],
    ]);
    expect(worstSellers.map((row) => [row.name.en, row.total])).toEqual([
      ["Salad", 1],
      ["Fries", 3],
      ["Soup", 4],
    ]);
  });

  it("sums a dish's quantity across separate orders", async () => {
    const burger = await seedMenuItem("Burger");
    const salad = await seedMenuItem("Salad");

    await seedOrder({ items: [{ menuItem: burger.id, quantity: 10 }] });
    await seedOrder({
      items: [
        { menuItem: salad.id, quantity: 1 },
        { menuItem: burger.id, quantity: 2 },
      ],
    });

    const { bestSellers } = await BestAndWorstSellers(SHOP_A.toString());

    expect(bestSellers.map((row) => [row.name.en, row.total])).toEqual([
      ["Burger", 12],
      ["Salad", 1],
    ]);
  });

  it("ranks by quantity sold, not by money taken", async () => {
    const cheap = await seedMenuItem("Bread");
    const pricey = await seedMenuItem("Steak");

    await seedOrder({
      totalAmount: 5000,
      items: [
        { menuItem: pricey.id, quantity: 1 },
        { menuItem: cheap.id, quantity: 9 },
      ],
    });

    const { bestSellers } = await BestAndWorstSellers(SHOP_A.toString());

    expect(bestSellers[0].name.en).toBe("Bread");
  });

  it("never counts another shop's orders", async () => {
    const mine = await seedMenuItem("Mine", SHOP_A);
    const theirs = await seedMenuItem("Theirs", SHOP_B);

    await seedOrder({
      shopId: SHOP_A,
      items: [{ menuItem: mine.id, quantity: 3 }],
    });
    await seedOrder({
      shopId: SHOP_B,
      items: [{ menuItem: theirs.id, quantity: 99 }],
    });

    const { bestSellers } = await BestAndWorstSellers(SHOP_A.toString());

    expect(bestSellers.map((row) => row.name.en)).toEqual(["Mine"]);
  });

  it("narrows to a date window when one is given", async () => {
    const item = await seedMenuItem("Seasonal");
    await seedOrder({
      items: [{ menuItem: item.id, quantity: 7 }],
      createdAt: new Date("2026-07-10"),
    });
    await seedOrder({
      items: [{ menuItem: item.id, quantity: 2 }],
      createdAt: new Date("2026-08-10"),
    });

    const august = await BestAndWorstSellers(
      SHOP_A.toString(),
      5,
      "2026-08-01",
      "2026-08-31",
    );

    expect(august.bestSellers).toEqual([
      {
        menuItemId: item.id,
        name: { en: "Seasonal", ar: "Seasonal بالعربية" },
        total: 2,
      },
    ]);
  });

  /**
   * REGRESSION for the calendar-day truncation bug (fixed 2026-08-24, see
   * TECH_DEBT.md / DECISIONS.md). The window is now half-open and computed
   * in PLATFORM_TIMEZONE ("Africa/Cairo"), so a sale placed later in the day
   * on the final day of the window is included rather than falling after a
   * UTC-midnight `$lte` cutoff.
   */
  it("includes a sale placed later on the final Cairo day of the window", async () => {
    const item = await seedMenuItem("End Of Month");
    await seedOrder({
      items: [{ menuItem: item.id, quantity: 6 }],
      createdAt: new Date("2026-08-31T13:00:00.000Z"),
    });

    const result = await BestAndWorstSellers(
      SHOP_A.toString(),
      5,
      "2026-08-01",
      "2026-08-31",
    );

    expect(result.bestSellers).toEqual([
      {
        menuItemId: item.id,
        name: { en: "End Of Month", ar: "End Of Month بالعربية" },
        total: 6,
      },
    ]);
  });

  /**
   * The precise edge, derived from the real IANA offset rather than a
   * hardcoded "+2"/"+3" assumption (Egypt observes DST roughly May-October).
   * `getPlatformTimeZoneOffsetMs` is the same primitive the service itself
   * uses, so this pins the half-open-window *contract*, not today's
   * specific offset.
   */
  it("excludes a sale exactly at the Cairo day-boundary close and includes one 1ms earlier", async () => {
    const insideItem = await seedMenuItem("Just Inside");
    const outsideItem = await seedMenuItem("Just Outside");

    // Cairo midnight of 2026-09-01 — the exclusive close of the window
    // requested as endDate "2026-08-31".
    const cairoOffsetMs = getPlatformTimeZoneOffsetMs(
      new Date("2026-09-01T00:00:00.000Z"),
    );
    const windowEndUtc = Date.UTC(2026, 8, 1) - cairoOffsetMs;

    await seedOrder({
      items: [{ menuItem: insideItem.id, quantity: 3 }],
      createdAt: new Date(windowEndUtc - 1),
    });
    await seedOrder({
      items: [{ menuItem: outsideItem.id, quantity: 9 }],
      createdAt: new Date(windowEndUtc),
    });

    const result = await BestAndWorstSellers(
      SHOP_A.toString(),
      5,
      "2026-08-01",
      "2026-08-31",
    );

    expect(result.bestSellers.map((row) => row.name.en)).toEqual([
      "Just Inside",
    ]);
  });

  it("ignores a half-specified window rather than filtering on an Invalid Date", async () => {
    const item = await seedMenuItem("Always");
    await seedOrder({
      items: [{ menuItem: item.id, quantity: 4 }],
      createdAt: new Date("2026-07-10"),
    });

    // The guard is `startDate && endDate`; with only one, no filter is applied.
    const result = await BestAndWorstSellers(
      SHOP_A.toString(),
      5,
      "2026-08-01",
    );

    expect(result.bestSellers).toHaveLength(1);
  });

  it("rejects an unparseable date rather than silently matching nothing", async () => {
    // `$match` inside an aggregation does no schema casting, so before the
    // shared date-window helper this would have silently produced an empty
    // report instead of a 400. The window parser throws before the
    // try/catch that wraps the aggregations, so this must NOT surface as
    // the generic "Failed to retrieve best and worst sellers" 422.
    await expect(
      BestAndWorstSellers(SHOP_A.toString(), 5, "not-a-date", "2026-08-31"),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("honours the limit", async () => {
    for (const [name, quantity] of [
      ["A", 1],
      ["B", 2],
      ["C", 3],
    ] as const) {
      const item = await seedMenuItem(name);
      await seedOrder({
        items: [{ menuItem: item.id, quantity }],
      });
    }

    const { bestSellers, worstSellers } = await BestAndWorstSellers(
      SHOP_A.toString(),
      2,
    );

    expect(bestSellers.map((row) => row.name.en)).toEqual(["C", "B"]);
    // Only "A" is left once the two best sellers are excluded — the limit is
    // an upper bound on each list, not a quota to be filled by repeating a
    // dish the owner has just been shown as a best seller.
    expect(worstSellers.map((row) => row.name.en)).toEqual(["A"]);
  });

  it("returns two empty lists for a shop that has sold nothing", async () => {
    await expect(BestAndWorstSellers(SHOP_A.toString())).resolves.toEqual({
      bestSellers: [],
      worstSellers: [],
    });
  });

  /**
   * REGRESSION. Best and worst are one ranking read from both ends, so a shop
   * with fewer distinct sold dishes than `limit` used to be shown the
   * identical set twice — its single best seller presented as a worst seller
   * too, on a brand new shop's dashboard, which is the first time anyone ever
   * looks at the feature.
   */
  it("never lists the same dish as both a best and a worst seller", async () => {
    const only = await seedMenuItem("Solo");
    await seedOrder({
      items: [{ menuItem: only.id, quantity: 3 }],
    });

    const { bestSellers, worstSellers } = await BestAndWorstSellers(
      SHOP_A.toString(),
      5,
    );

    expect(bestSellers.map((row) => row.name.en)).toEqual(["Solo"]);
    // Suppressed rather than repeated: with one dish sold there is no
    // comparison to make, and "your worst seller is your only seller" reads as
    // a bug in the numbers.
    expect(worstSellers).toEqual([]);
  });

  /**
   * Two dishes that sold exactly the same amount are the sharp edge of the
   * rule above: without a deterministic tie-break the two pipelines are free
   * to return the same row at the head of both lists. The secondary sort keys
   * are exact mirrors of each other, so they cannot.
   */
  it("keeps the lists disjoint even when every dish sold the same amount", async () => {
    for (const name of ["Tie A", "Tie B", "Tie C", "Tie D"]) {
      const item = await seedMenuItem(name);
      await seedOrder({ items: [{ menuItem: item.id, quantity: 5 }] });
    }

    const { bestSellers, worstSellers } = await BestAndWorstSellers(
      SHOP_A.toString(),
      2,
    );

    expect(bestSellers).toHaveLength(2);
    expect(worstSellers).toHaveLength(2);
    const overlap = worstSellers.filter((worst) =>
      bestSellers.some(
        (best) => String(best.menuItemId) === String(worst.menuItemId),
      ),
    );
    expect(overlap).toEqual([]);
  });

  /**
   * REGRESSION. `$lookup` + `$unwind` without `preserveNullAndEmptyArrays` is
   * an inner join: a dish that sold and was then deleted from the menu used to
   * vanish from the report entirely, so a report about the past silently
   * omitted exactly the history it exists to show — and the totals stayed
   * plausible, so nothing prompted anyone to look.
   */
  it("keeps sales of a menu item that has since been deleted, labelled rather than dropped", async () => {
    const kept = await seedMenuItem("Kept");
    const deleted = new mongoose.Types.ObjectId();

    await seedOrder({
      items: [
        { menuItem: deleted, quantity: 50 },
        { menuItem: kept.id, quantity: 1 },
      ],
    });

    const { bestSellers } = await BestAndWorstSellers(SHOP_A.toString());

    expect(bestSellers).toEqual([
      // The id still resolves to the order line, so the row remains traceable
      // even though the menu item behind it is gone.
      {
        menuItemId: deleted,
        name: { en: "Deleted item", ar: "صنف محذوف" },
        total: 50,
      },
      {
        menuItemId: kept.id,
        name: { en: "Kept", ar: "Kept بالعربية" },
        total: 1,
      },
    ]);
  });
});

describe("totalRevenue", () => {
  it("sums only orders the shop actually earned on", async () => {
    await seedOrder({ totalAmount: 100, orderStatus: OrderStatus.Confirmed });
    await seedOrder({ totalAmount: 200, orderStatus: OrderStatus.Preparing });
    await seedOrder({ totalAmount: 300, orderStatus: OrderStatus.Ready });
    await seedOrder({ totalAmount: 400, orderStatus: OrderStatus.Delivered });

    await expect(totalRevenue(SHOP_A.toString())).resolves.toBe(1000);
  });

  it("excludes cancelled and pending orders", async () => {
    await seedOrder({ totalAmount: 100, orderStatus: OrderStatus.Delivered });
    await seedOrder({ totalAmount: 999, orderStatus: OrderStatus.Cancelled });
    await seedOrder({ totalAmount: 888, orderStatus: OrderStatus.Pending });

    await expect(totalRevenue(SHOP_A.toString())).resolves.toBe(100);
  });

  it("never includes another shop's revenue", async () => {
    await seedOrder({ shopId: SHOP_A, totalAmount: 100 });
    await seedOrder({ shopId: SHOP_B, totalAmount: 5000 });

    await expect(totalRevenue(SHOP_A.toString())).resolves.toBe(100);
    await expect(totalRevenue(SHOP_B.toString())).resolves.toBe(5000);
  });

  it("returns 0 — not undefined or NaN — for a shop with no revenue", async () => {
    await seedOrder({ shopId: SHOP_B, totalAmount: 5000 });

    const total = await totalRevenue(SHOP_A.toString());

    expect(total).toBe(0);
    expect(Number.isNaN(total)).toBe(false);
  });
});
