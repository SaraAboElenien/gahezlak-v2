import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import type { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import { Shops } from "../../models/Shop";
import { Subscriptions, SubscriptionStatus } from "../../models/Subscription";
import { Plans } from "../../models/Plan";
import { MenuItemModel } from "../../models/MenuItem";
import { CategoryModel } from "../../models/Category";
import { Orders, OrderStatus } from "../../models/Order";
import { PaymentMethods } from "../../models/Payment";
import { clearTestDB } from "../db-test-helper";

/**
 * Route/controller-level coverage for `POST /api/v1/shops/orders`, the public
 * customer checkout endpoint. It is deliberately unauthenticated — a diner
 * scanning a QR code has no session — which is exactly why a critical
 * mass-assignment hole survived here: the controller used to spread
 * `req.body` straight into `Orders.create`, so an anonymous caller could POST
 * a normal order plus `orderStatus: "Confirmed"` and land a fully-paid-looking
 * order on the kitchen queue for free. `pickCustomerOrderFields` (an
 * allowlist) fixed it and is pinned at the unit level in
 * tests/controllers/order-mass-assignment.test.ts — this file pins the same
 * property end to end, through real routing, real validation and a real
 * database, because none of those layers were ever exercised together before.
 *
 * `createOrderHandler` wraps the order-number counter and the order write in
 * `session.withTransaction`, and mongod only supports transactions on a
 * replica set — the standalone server behind the shared `connectTestDB()`
 * helper would fail every request here with "Transaction numbers are only
 * allowed on a replica set member or mongos". A single-node replica set (the
 * same approach as tests/services/shop.service.test.ts) is the smallest thing
 * that runs the real code path.
 *
 * Every test pays by Cash on purpose: Cash skips Paymob entirely
 * (`isPaidOffline` in order.controller.ts), so these tests need no
 * third-party HTTP mocking at all.
 */

process.env.JWT_SECRET ??= "test-jwt-secret";
process.env.FRONTEND_URL ??= "https://app.gahezlak.test";

async function buildApp() {
  const { default: app } = await import("../../app");
  return app;
}

let replSet: MongoMemoryReplSet | null = null;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri();
  await mongoose.connect(replSet.getUri());
  // Build unique indexes (Shops.name, Orders.orderNumber) up front so the
  // background index build can't race a test and pass for the wrong reason.
  await Shops.init();
  await Orders.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
});

beforeEach(async () => {
  await clearTestDB();
});

let shopNameSeq = 0;
const nextShopName = () => `Order Route Test Bistro ${++shopNameSeq}`;

/** A shop plus an entitling (active) subscription — what the handler needs
 * before it will accept an order at all. */
async function seedEntitledShop() {
  const ownerId = new mongoose.Types.ObjectId();
  const shop = await Shops.create({
    name: nextShopName(),
    type: "restaurant",
    address: { country: "Egypt", city: "Cairo", street: "1 Test St" },
    phoneNumber: "01000000000",
    email: "owner@example.com",
    ownerId,
  });

  const plan = await Plans.create({
    planGroup: "Starter",
    title: "Starter",
    description: "Starter plan",
    frequency: "monthly",
    currency: "EGP",
    price: 100,
    paymobPlanId: 1,
    features: [],
    trialPeriodDays: 0,
  });

  await Subscriptions.create({
    userId: ownerId,
    shop: shop._id,
    plan: plan._id,
    status: SubscriptionStatus.ACTIVE,
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  return shop;
}

async function seedMenuItem(
  shopId: Types.ObjectId,
  overrides: { price?: number; isAvailable?: boolean } = {},
) {
  const category = await CategoryModel.create({
    shopId,
    name: { en: "Mains", ar: "أطباق رئيسية" },
  });

  return MenuItemModel.create({
    shopId,
    categoryId: category._id,
    name: { en: "Burger", ar: "برجر" },
    price: 100,
    isAvailable: true,
    discountPercentage: 0,
    ...overrides,
  });
}

function validOrderBody(
  shopName: string,
  menuItemId: Types.ObjectId,
  overrides: Record<string, unknown> = {},
) {
  return {
    shopName,
    tableNumber: 5,
    customerFirstName: "Jane",
    customerLastName: "Diner",
    customerPhoneNumber: "01000000000",
    paymentMethod: PaymentMethods.Cash,
    orderItems: [
      {
        menuItem: menuItemId.toString(),
        quantity: 2,
        customizationDetails: "",
      },
    ],
    ...overrides,
  };
}

describe("POST /api/v1/shops/orders — mass-assignment security", () => {
  it("creates the order but ignores a client-forged orderStatus and paymobTransactionId", async () => {
    const app = await buildApp();
    const shop = await seedEntitledShop();
    const item = await seedMenuItem(shop._id, { price: 100 });

    const res = await request(app)
      .post("/api/v1/shops/orders")
      .send(
        validOrderBody(shop.name, item._id as Types.ObjectId, {
          // The attack: a normal, otherwise-valid order that also tries to
          // mark itself already paid and confirmed.
          orderStatus: OrderStatus.Confirmed,
          paymobTransactionId: "999",
        }),
      );

    // A valid order — it must still succeed. Refusing it would be the wrong
    // fix (it would also break every legitimate request).
    expect(res.status).toBe(201);
    expect(res.body.data.orderNumber).toBeTypeOf("number");

    // The decisive assertions: read the *persisted* document, not the
    // response, because the response is shaped by the controller and could
    // hide a stored value it doesn't echo back.
    const stored = await Orders.findOne({
      orderNumber: res.body.data.orderNumber,
    }).lean();

    expect(stored).not.toBeNull();
    expect(stored?.orderStatus).toBe(OrderStatus.Pending);
    expect(stored?.paymobTransactionId).toBeUndefined();
  });
});

describe("POST /api/v1/shops/orders — happy path", () => {
  it("creates a Cash order and round-trips the customer-submitted fields", async () => {
    const app = await buildApp();
    const shop = await seedEntitledShop();
    const item = await seedMenuItem(shop._id, { price: 75 });

    const res = await request(app)
      .post("/api/v1/shops/orders")
      .send(validOrderBody(shop.name, item._id as Types.ObjectId));

    expect(res.status).toBe(201);
    const orderNumber = res.body.data.orderNumber;
    expect(orderNumber).toBeTypeOf("number");
    // Cash never goes to Paymob, so there is no checkout iframe to redirect to.
    expect(res.body.data.iframeUrl).toBe("");

    const stored = await Orders.findOne({ orderNumber }).lean();
    expect(stored).not.toBeNull();
    expect(stored?.shopId.toString()).toBe(shop._id.toString());
    expect(stored?.customerFirstName).toBe("Jane");
    expect(stored?.customerLastName).toBe("Diner");
    expect(stored?.customerPhoneNumber).toBe("01000000000");
    expect(stored?.tableNumber).toBe(5);
    expect(stored?.paymentMethod).toBe(PaymentMethods.Cash);
    expect(stored?.orderStatus).toBe(OrderStatus.Pending);
    expect(stored?.orderItems[0].quantity).toBe(2);
    // 75 x 2, priced from the menu item, not from the (absent) request price.
    expect(stored?.totalAmount).toBe(150);
  });
});

describe("POST /api/v1/shops/orders — server-derived money", () => {
  it("recomputes totals from the menu instead of trusting client-supplied price/totalAmount", async () => {
    const app = await buildApp();
    const shop = await seedEntitledShop();
    const item = await seedMenuItem(shop._id, { price: 40 });

    const res = await request(app)
      .post("/api/v1/shops/orders")
      .send(
        validOrderBody(shop.name, item._id as Types.ObjectId, {
          // Absurd client-supplied money: a customer trying to check out for
          // one piastre no matter what the menu says.
          totalAmount: 0.01,
          orderItems: [
            {
              menuItem: (item._id as Types.ObjectId).toString(),
              quantity: 1,
              customizationDetails: "",
              price: 0.01,
              discountPercentage: 99,
            },
          ],
        }),
      );

    expect(res.status).toBe(201);
    const stored = await Orders.findOne({
      orderNumber: res.body.data.orderNumber,
    }).lean();

    expect(stored?.orderItems[0].price).toBe(40);
    expect(stored?.orderItems[0].discountPercentage).toBe(0);
    expect(stored?.totalAmount).toBe(40);
  });
});

describe("POST /api/v1/shops/orders — validation and lookup failures", () => {
  it("404s for a shop name that does not exist", async () => {
    const app = await buildApp();

    const res = await request(app)
      .post("/api/v1/shops/orders")
      .send(validOrderBody("No Such Shop", new mongoose.Types.ObjectId(), {}));

    expect(res.status).toBe(404);
    expect(await Orders.countDocuments({})).toBe(0);
  });

  it("rejects the request when required fields are missing, before touching the database", async () => {
    const app = await buildApp();
    const shop = await seedEntitledShop();

    const res = await request(app).post("/api/v1/shops/orders").send({
      shopName: shop.name,
      // customerFirstName, customerLastName, customerPhoneNumber,
      // paymentMethod and orderItems are all missing.
    });

    // express-validator's ValidationError maps to 422, not the generic 400.
    expect(res.status).toBe(422);
    expect(await Orders.countDocuments({})).toBe(0);
  });

  it("refuses an order for a shop with no active subscription, without creating it", async () => {
    const app = await buildApp();
    // A shop with no Subscription document at all — assertShopHasActiveSubscription
    // throws for it just as it would for an expired/cancelled one.
    const shop = await Shops.create({
      name: nextShopName(),
      type: "restaurant",
      address: { country: "Egypt", city: "Cairo", street: "1 Test St" },
      phoneNumber: "01000000000",
      email: "owner@example.com",
      ownerId: new mongoose.Types.ObjectId(),
    });
    const item = await seedMenuItem(shop._id);

    const res = await request(app)
      .post("/api/v1/shops/orders")
      .send(validOrderBody(shop.name, item._id as Types.ObjectId));

    expect(res.status).toBe(405);
    expect(await Orders.countDocuments({})).toBe(0);
  });
});
