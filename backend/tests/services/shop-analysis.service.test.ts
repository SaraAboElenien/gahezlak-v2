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
   * CHARACTERISATION (see the report). `$year`/`$month`/`$dayOfMonth` bucket in
   * **UTC** unless given a `timezone`. Every shop on this platform is in Cairo
   * (UTC+2/+3), so the dinner rush that runs past midnight local time is filed
   * under the previous day, and a "daily orders" chart is shifted for every
   * order placed between midnight and 02:00/03:00 local.
   */
  it("CHARACTERISATION: buckets in UTC, so a post-midnight Cairo order lands on the previous day", async () => {
    // 2026-03-02T00:30 in Cairo (UTC+2) is 2026-03-01T22:30Z.
    await seedOrder({ createdAt: new Date("2026-03-01T22:30:00.000Z") });

    const counts = await OrderCountsByDate(SHOP_A.toString(), "daily");

    expect(counts).toEqual([
      { _id: { year: 2026, month: 3, day: 1 }, count: 1 },
    ]);
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
   * CHARACTERISATION (see the report). `SalesComparison` applies **no status
   * filter**, so a cancelled order counts as a sale — while `totalRevenue()`
   * in this same file deliberately excludes Cancelled and Pending. The two
   * numbers on one dashboard therefore disagree about the same month, and the
   * comparison chart is inflated by every order the kitchen refused.
   */
  it("CHARACTERISATION: counts cancelled and pending orders as sales, unlike totalRevenue()", async () => {
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

    expect(comparison.total1).toBe(200);
    // The very same orders, through the other revenue function on this page:
    await expect(totalRevenue(SHOP_A.toString())).resolves.toBe(100);
  });
});

describe("BestAndWorstSellers", () => {
  it("ranks menu items by quantity sold, best descending and worst ascending", async () => {
    const burger = await seedMenuItem("Burger");
    const salad = await seedMenuItem("Salad");
    const pizza = await seedMenuItem("Pizza");

    await seedOrder({
      items: [
        { menuItem: burger.id, quantity: 10 },
        { menuItem: pizza.id, quantity: 5 },
      ],
    });
    await seedOrder({
      items: [
        { menuItem: salad.id, quantity: 1 },
        { menuItem: burger.id, quantity: 2 },
      ],
    });

    const { bestSellers, worstSellers } = await BestAndWorstSellers(
      SHOP_A.toString(),
    );

    expect(bestSellers.map((row) => [row.name.en, row.total])).toEqual([
      ["Burger", 12],
      ["Pizza", 5],
      ["Salad", 1],
    ]);
    expect(worstSellers.map((row) => row.name.en)).toEqual([
      "Salad",
      "Pizza",
      "Burger",
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
    expect(worstSellers.map((row) => row.name.en)).toEqual(["A", "B"]);
  });

  it("returns two empty lists for a shop that has sold nothing", async () => {
    await expect(BestAndWorstSellers(SHOP_A.toString())).resolves.toEqual({
      bestSellers: [],
      worstSellers: [],
    });
  });

  /**
   * CHARACTERISATION (see the report). Best and worst are the same aggregation
   * sorted two ways, so a shop with fewer distinct sold items than `limit` gets
   * the identical set presented twice — the top seller is also displayed as a
   * worst seller. Pinned because it is a presentation decision, not a query bug.
   */
  it("CHARACTERISATION: with fewer items than the limit, best and worst are the same set reversed", async () => {
    const only = await seedMenuItem("Solo");
    await seedOrder({
      items: [{ menuItem: only.id, quantity: 3 }],
    });

    const { bestSellers, worstSellers } = await BestAndWorstSellers(
      SHOP_A.toString(),
      5,
    );

    expect(bestSellers).toEqual(worstSellers);
  });

  /**
   * CHARACTERISATION. `$lookup` + `$unwind` without
   * `preserveNullAndEmptyArrays` is an inner join: a dish that was sold and
   * then deleted from the menu disappears from the report entirely rather than
   * appearing as an unnamed row.
   */
  it("CHARACTERISATION: drops sales of a menu item that has since been deleted", async () => {
    const kept = await seedMenuItem("Kept");
    const deleted = new mongoose.Types.ObjectId();

    await seedOrder({
      items: [
        { menuItem: deleted, quantity: 50 },
        { menuItem: kept.id, quantity: 1 },
      ],
    });

    const { bestSellers } = await BestAndWorstSellers(SHOP_A.toString());

    expect(bestSellers.map((row) => row.name.en)).toEqual(["Kept"]);
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
