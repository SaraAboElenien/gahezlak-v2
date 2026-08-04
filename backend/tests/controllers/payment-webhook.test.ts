import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  vi,
} from "vitest";
import crypto from "crypto";
import mongoose from "mongoose";
import type { Request, Response } from "express";
import {
  connectTestDB,
  disconnectTestDB,
  clearTestDB,
} from "../db-test-helper";

/**
 * Regression coverage for a silent data-corruption bug in the paid-order
 * webhook.
 *
 * `handleOrderPaid` used to write `paymentMethod: PaymentMethods.CreditCard`
 * on every order it confirmed, with the comment "Assuming CreditCard for this
 * example". The field is set at order creation from the customer's validated
 * selection, and `createPaymentIntent` picks the Paymob integration *from that
 * value* — so the overwrite could only ever destroy the truth. Nothing failed
 * loudly: orders were confirmed correctly and simply mislabelled, which would
 * have quietly corrupted every non-card order once the cash and wallet
 * integrations go live, along with any revenue reporting built on the field.
 */

const HMAC_SECRET = "test-hmac-secret";

// paymob-hmac-verification.ts reads PAYMOB_HMAC_SECRET at module-load time,
// so it must be set before the controller (and its import graph) is loaded.
process.env.PAYMOB_HMAC_SECRET = HMAC_SECRET;

// The exact ordered field list the transaction HMAC is computed over, mirroring
// utils/paymob-hmac-verification.ts.
const HMAC_KEYS = [
  "amount_cents",
  "created_at",
  "currency",
  "error_occured",
  "has_parent_transaction",
  "id",
  "integration_id",
  "is_3d_secure",
  "is_auth",
  "is_capture",
  "is_refunded",
  "is_standalone_payment",
  "is_voided",
  "order.id",
  "owner",
  "pending",
  "source_data.pan",
  "source_data.sub_type",
  "source_data.type",
  "success",
];

type TransactionObj = Record<string, unknown>;

function signTransaction(obj: TransactionObj): string {
  const concatenated = HMAC_KEYS.map((key) => {
    const value = key
      .split(".")
      .reduce<unknown>(
        (acc, part) =>
          acc && typeof acc === "object"
            ? (acc as Record<string, unknown>)[part]
            : undefined,
        obj,
      );
    return String(value ?? "");
  }).join("");

  return crypto
    .createHmac("sha512", HMAC_SECRET)
    .update(concatenated)
    .digest("hex");
}

function buildPaidTransaction(
  orderId: string,
  overrides: Partial<TransactionObj> = {},
): TransactionObj {
  return {
    id: 987654,
    amount_cents: 15000,
    created_at: "2026-08-03T12:00:00Z",
    currency: "EGP",
    error_occured: false,
    has_parent_transaction: false,
    integration_id: 5174186,
    is_3d_secure: true,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    order: { id: 111222 },
    owner: 333,
    pending: false,
    source_data: { pan: "0007", sub_type: "MasterCard", type: "card" },
    success: true,
    payment_key_claims: { extra: { orderId } },
    ...overrides,
  };
}

function mockResponse() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
}

async function createOrder(paymentMethod: string, orderNumber: number) {
  const { Orders, OrderStatus } = await import("../../models/Order");
  return Orders.create({
    shopId: new mongoose.Types.ObjectId(),
    orderNumber,
    customerFirstName: "Test",
    customerLastName: "Customer",
    customerPhoneNumber: "01000000000",
    paymentMethod,
    orderStatus: OrderStatus.Pending,
    totalAmount: 150,
    orderItems: [
      {
        menuItem: new mongoose.Types.ObjectId(),
        quantity: 1,
        price: 150,
      },
    ],
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
  vi.restoreAllMocks();
});

describe("handlePaymobOrdersWebhook", () => {
  it("confirms a paid order without overwriting the customer's chosen payment method", async () => {
    const { handlePaymobOrdersWebhook } =
      await import("../../controllers/payment.webhook.controller");
    const { Orders, OrderStatus } = await import("../../models/Order");

    // A cash order — the case the old hardcoded `CreditCard` write destroyed.
    const order = await createOrder("Cash", 100001);
    const obj = buildPaidTransaction(order._id.toString(), {
      source_data: { pan: "", sub_type: "", type: "cash" },
    });

    const req = {
      body: { obj },
      query: { hmac: signTransaction(obj) },
    } as unknown as Request;

    await handlePaymobOrdersWebhook(req, mockResponse(), vi.fn());

    const updated = await Orders.findById(order._id);
    expect(updated?.orderStatus).toBe(OrderStatus.Confirmed);
    expect(updated?.paymobTransactionId).toBe("987654");
    // The regression: this must remain "Cash", not become "CreditCard".
    expect(updated?.paymentMethod).toBe("Cash");
  });

  it("preserves the stored method for card orders too", async () => {
    const { handlePaymobOrdersWebhook } =
      await import("../../controllers/payment.webhook.controller");
    const { Orders, OrderStatus } = await import("../../models/Order");

    const order = await createOrder("DebitCard", 100002);
    const obj = buildPaidTransaction(order._id.toString());

    const req = {
      body: { obj },
      query: { hmac: signTransaction(obj) },
    } as unknown as Request;

    await handlePaymobOrdersWebhook(req, mockResponse(), vi.fn());

    const updated = await Orders.findById(order._id);
    expect(updated?.orderStatus).toBe(OrderStatus.Confirmed);
    // Paymob reports only the broad channel ("card"), which cannot distinguish
    // credit from debit — so the customer's more specific selection stands.
    expect(updated?.paymentMethod).toBe("DebitCard");
  });

  it("rejects a payload whose HMAC does not match and leaves the order untouched", async () => {
    const { handlePaymobOrdersWebhook } =
      await import("../../controllers/payment.webhook.controller");
    const { Orders, OrderStatus } = await import("../../models/Order");

    const order = await createOrder("Cash", 100003);
    const obj = buildPaidTransaction(order._id.toString());

    const req = {
      body: { obj },
      query: { hmac: "not-the-right-signature" },
    } as unknown as Request;

    await expect(
      handlePaymobOrdersWebhook(req, mockResponse(), vi.fn()),
    ).rejects.toThrow();

    const untouched = await Orders.findById(order._id);
    expect(untouched?.orderStatus).toBe(OrderStatus.Pending);
    expect(untouched?.paymobTransactionId).toBeUndefined();
  });

  it("does not confirm an order while the transaction is still pending", async () => {
    const { handlePaymobOrdersWebhook } =
      await import("../../controllers/payment.webhook.controller");
    const { Orders, OrderStatus } = await import("../../models/Order");

    const order = await createOrder("Cash", 100004);
    const obj = buildPaidTransaction(order._id.toString(), {
      success: true,
      pending: true,
    });

    const req = {
      body: { obj },
      query: { hmac: signTransaction(obj) },
    } as unknown as Request;

    await handlePaymobOrdersWebhook(req, mockResponse(), vi.fn());

    const untouched = await Orders.findById(order._id);
    expect(untouched?.orderStatus).toBe(OrderStatus.Pending);
  });
});

/**
 * Trigger-type routing for subscription webhooks.
 *
 * `KNOWN_ISSUES.md` claimed cancellations were silently dropped because the
 * real trigger value was "Subscription Cancelled" (two L's) while the code
 * tested for "canceled" (one L). Paymob support gave the literal list on
 * 2026-08-05 and the code was right all along — it is "canceled", and the
 * renewal trigger is "Successful Transaction". These tests pin the values
 * down against the vendor's own answer so the false alarm can't come back,
 * and cover the four triggers that genuinely were unhandled.
 */
function signSubscription(triggerType: string, subscriptionId: number): string {
  return crypto
    .createHmac("sha512", HMAC_SECRET)
    .update(`${triggerType}for${subscriptionId}`)
    .digest("hex");
}

async function createSubscription(paymobSubscriptionId: number) {
  const { Subscriptions, SubscriptionStatus } =
    await import("../../models/Subscription");
  const { Plans } = await import("../../models/Plan");

  const plan = await Plans.create({
    planGroup: "Starter",
    title: "Starter (monthly - EGP)",
    description: "Test plan",
    currency: "EGP",
    frequency: "monthly",
    features: [],
    price: 500,
    isActive: true,
    paymobPlanId: 4242,
    trialPeriodDays: 0,
  });

  return Subscriptions.create({
    userId: new mongoose.Types.ObjectId(),
    shop: new mongoose.Types.ObjectId(),
    plan: plan._id,
    status: SubscriptionStatus.ACTIVE,
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
    paymobSubscriptionId,
  });
}

function subscriptionRequest(triggerType: string, subscriptionId: number) {
  return {
    body: {
      trigger_type: triggerType,
      subscription_data: {
        id: subscriptionId,
        created_at: new Date().toISOString(),
      },
      hmac: signSubscription(triggerType, subscriptionId),
    },
    query: {},
  } as unknown as Request;
}

describe("handlePaymobSubscriptionWebhook trigger routing", () => {
  it('cancels on the literal trigger "canceled" that Paymob actually sends', async () => {
    const { handlePaymobSubscriptionWebhook } =
      await import("../../controllers/payment.webhook.controller");
    const { Subscriptions, SubscriptionStatus } =
      await import("../../models/Subscription");

    const subscription = await createSubscription(700001);

    await handlePaymobSubscriptionWebhook(
      subscriptionRequest("canceled", 700001),
      mockResponse(),
      vi.fn(),
    );

    const updated = await Subscriptions.findById(subscription._id);
    expect(updated?.status).toBe(SubscriptionStatus.CANCELLED);
    expect(updated?.cancelledAt).toBeInstanceOf(Date);
  });

  it("revokes access when Paymob suspends a subscription", async () => {
    const { handlePaymobSubscriptionWebhook } =
      await import("../../controllers/payment.webhook.controller");
    const { Subscriptions, SubscriptionStatus } =
      await import("../../models/Subscription");

    const subscription = await createSubscription(700002);

    await handlePaymobSubscriptionWebhook(
      subscriptionRequest("suspended", 700002),
      mockResponse(),
      vi.fn(),
    );

    const updated = await Subscriptions.findById(subscription._id);
    expect(updated?.status).toBe(SubscriptionStatus.EXPIRED);
  });

  it("restores access when Paymob resumes a subscription", async () => {
    const { handlePaymobSubscriptionWebhook } =
      await import("../../controllers/payment.webhook.controller");
    const { Subscriptions, SubscriptionStatus } =
      await import("../../models/Subscription");

    const subscription = await createSubscription(700003);
    await Subscriptions.findByIdAndUpdate(subscription._id, {
      status: SubscriptionStatus.EXPIRED,
    });

    await handlePaymobSubscriptionWebhook(
      subscriptionRequest("resumed", 700003),
      mockResponse(),
      vi.fn(),
    );

    const updated = await Subscriptions.findById(subscription._id);
    expect(updated?.status).toBe(SubscriptionStatus.ACTIVE);
  });

  it("leaves the subscription untouched on a failed renewal, as Paymob documents", async () => {
    const { handlePaymobSubscriptionWebhook } =
      await import("../../controllers/payment.webhook.controller");
    const { Subscriptions, SubscriptionStatus } =
      await import("../../models/Subscription");

    const subscription = await createSubscription(700004);

    for (const trigger of [
      "Failed Transaction",
      "Failed Overdue Transaction",
    ]) {
      await handlePaymobSubscriptionWebhook(
        subscriptionRequest(trigger, 700004),
        mockResponse(),
        vi.fn(),
      );
    }

    const updated = await Subscriptions.findById(subscription._id);
    expect(updated?.status).toBe(SubscriptionStatus.ACTIVE);
  });

  it("rejects a subscription webhook whose HMAC does not match", async () => {
    const { handlePaymobSubscriptionWebhook } =
      await import("../../controllers/payment.webhook.controller");
    const { Subscriptions, SubscriptionStatus } =
      await import("../../models/Subscription");

    const subscription = await createSubscription(700005);

    const req = {
      body: {
        trigger_type: "canceled",
        subscription_data: { id: 700005 },
        hmac: "not-the-right-signature",
      },
      query: {},
    } as unknown as Request;

    // Unlike the order webhook, this handler forwards to next() rather than
    // throwing — so the rejection surfaces as an error passed to next.
    const next = vi.fn();
    await handlePaymobSubscriptionWebhook(req, mockResponse(), next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));

    const untouched = await Subscriptions.findById(subscription._id);
    expect(untouched?.status).toBe(SubscriptionStatus.ACTIVE);
  });
});
