import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import type { IOrder } from "../../models/Order";
import type { IPlan } from "../../models/Plan";
import type { IUser } from "../../models/User";

/**
 * Covers the corrections made after Paymob support answered our integration
 * questions on 2026-08-05. Each test below pins down a behaviour that was
 * previously wrong in a way no test caught, because nothing exercised
 * utils/paymob.ts at all:
 *
 *  - free-trial signups were charged the full plan price on day one, because
 *    the first transaction went through the card integration instead of the
 *    verification integration Paymob prescribes;
 *  - createSubscriptionIntent authenticated with `Bearer`, which the Intention
 *    API does not accept — only `Token`;
 *  - `special_reference` was the order id, so a customer retrying a declined
 *    payment collided with their own first attempt and could never pay;
 *  - the refund path posted to the *void* endpoint with no amount, so
 *    cancelling an already-settled order never actually refunded anyone.
 */

const CARD_ID = 5174186;
const MOTO_ID = 5818529;
const WALLET_ID = 5818538;
const VERIFICATION_ID = 5818570;

// utils/paymob.ts reads every integration id at module-load time, so these
// must be in place before the module (and its import graph) is first loaded.
process.env.PAYMOB_DEFAULT_INTEGRATION_ID = String(CARD_ID);
process.env.PAYMOB_MOTO_INTEGRATION_ID = String(MOTO_ID);
process.env.PAYMOB_WALLET_INTEGRATION_ID = String(WALLET_ID);
process.env.PAYMOB_VERIFICATION_INTEGRATION_ID = String(VERIFICATION_ID);
process.env.PAYMOB_SECRET_KEY = "egy_sk_test_secret";
process.env.PAYMOB_PUBLIC_KEY = "egy_pk_test_public";
process.env.FRONTEND_URL = "http://localhost:5173";

vi.mock("axios", () => {
  const post = vi.fn();
  return { default: { post }, AxiosError: class extends Error {} };
});

type PostMock = ReturnType<typeof vi.fn>;

let axiosPost: PostMock;
let paymob: typeof import("../../utils/paymob");
let PaymentMethods: typeof import("../../models/Payment").PaymentMethods;

beforeAll(async () => {
  const axios = await import("axios");
  axiosPost = (axios.default as unknown as { post: PostMock }).post;
  paymob = await import("../../utils/paymob");
  ({ PaymentMethods } = await import("../../models/Payment"));
});

beforeEach(() => {
  axiosPost.mockReset();
  axiosPost.mockResolvedValue({ data: { client_secret: "cs_test", id: 1 } });
});

/** The request body of the nth axios.post call. */
function bodyOf(callIndex = 0): Record<string, unknown> {
  return axiosPost.mock.calls[callIndex][1] as Record<string, unknown>;
}

/** The URL of the nth axios.post call. */
function urlOf(callIndex = 0): string {
  return axiosPost.mock.calls[callIndex][0] as string;
}

/** The Authorization header of the nth axios.post call. */
function authOf(callIndex = 0): string {
  const config = axiosPost.mock.calls[callIndex][2] as {
    headers: Record<string, string>;
  };
  return config.headers.Authorization;
}

function buildPlan(overrides: Partial<IPlan> = {}): IPlan {
  return {
    _id: new mongoose.Types.ObjectId(),
    title: "Starter (monthly - EGP)",
    description: "Starter plan",
    currency: "EGP",
    price: 500,
    paymobPlanId: 4242,
    ...overrides,
  } as unknown as IPlan;
}

function buildUser(): IUser {
  return {
    _id: new mongoose.Types.ObjectId(),
    firstName: "Test",
    lastName: "Owner",
    email: "owner@example.com",
    phoneNumber: "01000000000",
  } as unknown as IUser;
}

function buildOrder(paymentMethod: string): IOrder {
  return {
    _id: new mongoose.Types.ObjectId(),
    orderNumber: 270004,
    totalAmount: 150,
    paymentMethod,
    orderItems: [
      {
        menuItem: { name: { en: "Burger" }, description: { en: "Beef" } },
        quantity: 1,
        price: 150,
      },
    ],
  } as unknown as IOrder;
}

describe("createSubscriptionIntent", () => {
  it("runs a free trial's first transaction through the verification integration, not the card one", async () => {
    await paymob.createSubscriptionIntent({
      plan: buildPlan(),
      user: buildUser(),
      trialDays: 14,
    });

    expect(bodyOf().payment_methods).toEqual([VERIFICATION_ID]);
  });

  it("charges the card integration when there is no trial", async () => {
    await paymob.createSubscriptionIntent({
      plan: buildPlan(),
      user: buildUser(),
      trialDays: 0,
    });

    expect(bodyOf().payment_methods).toEqual([CARD_ID]);
  });

  it("sets subscription_start_date to the trial end date, and omits it without a trial", async () => {
    await paymob.createSubscriptionIntent({
      plan: buildPlan(),
      user: buildUser(),
      trialDays: 14,
    });
    const withTrial = bodyOf().subscription_start_date as string;

    const expected = new Date(Date.now() + 14 * 86400000)
      .toISOString()
      .split("T")[0];
    expect(withTrial).toBe(expected);

    axiosPost.mockClear();
    await paymob.createSubscriptionIntent({
      plan: buildPlan(),
      user: buildUser(),
      trialDays: 0,
    });
    expect(bodyOf()).not.toHaveProperty("subscription_start_date");
  });

  it("authenticates with Token, not Bearer — the Intention API rejects Bearer", async () => {
    await paymob.createSubscriptionIntent({
      plan: buildPlan(),
      user: buildUser(),
      trialDays: 0,
    });

    expect(authOf()).toBe("Token egy_sk_test_secret");
  });
});

describe("createPaymentIntent", () => {
  const customer = {
    first_name: "Test",
    last_name: "Customer",
    phone_number: "01000000000",
  };

  it("uses the card integration for card payments", async () => {
    await paymob.createPaymentIntent({
      order: buildOrder(PaymentMethods.CreditCard),
      shopName: "test-bistro",
      customer,
    });

    expect(bodyOf().payment_methods).toEqual([CARD_ID]);
  });

  it("routes every mobile wallet through the single wallet integration", async () => {
    for (const method of [
      PaymentMethods.VodafoneCash,
      PaymentMethods.OrangeMoney,
      PaymentMethods.EtisalatWallet,
    ]) {
      axiosPost.mockClear();
      await paymob.createPaymentIntent({
        order: buildOrder(method),
        shopName: "test-bistro",
        customer,
      });
      expect(bodyOf().payment_methods).toEqual([WALLET_ID]);
    }
  });

  it("refuses payment methods with no configured integration instead of silently charging a card", async () => {
    // Cash is settled in person and never reaches Paymob; Fawry and
    // BankTransfer have no integration at all. Falling back to the card
    // integration would charge the customer through a channel they did not
    // choose.
    for (const method of [
      PaymentMethods.Cash,
      PaymentMethods.Fawry,
      PaymentMethods.BankTransfer,
    ]) {
      await expect(
        paymob.createPaymentIntent({
          order: buildOrder(method),
          shopName: "test-bistro",
          customer,
        }),
      ).rejects.toThrow();
    }
    expect(axiosPost).not.toHaveBeenCalled();
  });

  it("sends a unique special_reference per attempt so a retry cannot collide with itself", async () => {
    const order = buildOrder(PaymentMethods.CreditCard);

    await paymob.createPaymentIntent({
      order,
      shopName: "test-bistro",
      customer,
    });
    // A different clock reading is what makes the second attempt distinct;
    // pin it rather than relying on the two calls landing in different ms.
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);
    await paymob.createPaymentIntent({
      order,
      shopName: "test-bistro",
      customer,
    });

    const first = bodyOf(0).special_reference as string;
    const second = bodyOf(1).special_reference as string;

    expect(first).not.toBe(second);
    // The order id stays the queryable prefix, and the webhook still
    // reconciles on extras.orderId regardless.
    expect(first.startsWith(order._id.toString())).toBe(true);
    expect(second.startsWith(order._id.toString())).toBe(true);
    expect(bodyOf(1).extras).toEqual({ orderId: order._id.toString() });

    vi.restoreAllMocks();
  });
});

describe("void vs refund", () => {
  it("refundTransaction posts to /refund with an amount", async () => {
    await paymob.refundTransaction("987654", 15000);

    expect(urlOf()).toBe(
      "https://accept.paymob.com/api/acceptance/void_refund/refund",
    );
    expect(bodyOf()).toEqual({
      transaction_id: "987654",
      amount_cents: 15000,
    });
  });

  it("voidTransaction posts to /void with no amount", async () => {
    await paymob.voidTransaction("987654");

    expect(urlOf()).toBe(
      "https://accept.paymob.com/api/acceptance/void_refund/void",
    );
    expect(bodyOf()).toEqual({ transaction_id: "987654" });
  });
});

describe("createSubscriptionPlan", () => {
  it("creates the plan against the MOTO integration and never bills the first transaction's amount", async () => {
    // paymobLogin() posts first, so the plan request is the second call.
    axiosPost
      .mockResolvedValueOnce({ data: { token: "auth-token" } })
      .mockResolvedValueOnce({ data: { id: 4242 } });

    await paymob.createSubscriptionPlan({
      planName: "Starter (monthly - EGP)",
      frequency: "monthly",
      amountInCents: 50000,
      isActive: true,
    });

    const plan = bodyOf(1);
    expect(plan.integration).toBe(MOTO_ID);
    // true would pin the recurring amount to the first transaction — which,
    // on a free trial, is a zero-cost verification hold.
    expect(plan.use_transaction_amount).toBe(false);
    expect(plan.plan_type).toBe("rent");
  });

  it("maps frequency onto Paymob's choice enum — yearly is 360, not 365", async () => {
    // `frequency` is a fixed choice field. 365 is not in it, so every yearly
    // plan was rejected with `"365" is not a valid choice` — which nothing
    // could observe until plans became creatable at all on 2026-08-05.
    // Enum read from OPTIONS /api/acceptance/subscription-plans.
    for (const [frequency, expected] of [
      ["monthly", 30],
      ["yearly", 360],
    ] as const) {
      axiosPost.mockReset();
      axiosPost
        .mockResolvedValueOnce({ data: { token: "auth-token" } })
        .mockResolvedValueOnce({ data: { id: 4242 } });

      await paymob.createSubscriptionPlan({
        planName: `Starter (${frequency} - EGP)`,
        frequency,
        amountInCents: 50000,
        isActive: true,
      });

      expect(bodyOf(1).frequency).toBe(expected);
    }
  });
});
