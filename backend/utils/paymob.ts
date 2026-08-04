import axios, { AxiosError } from "axios";
import { UnprocessableError } from "../errors/unprocessable-error";
import { IPlan } from "../models/Plan";
import { IUser } from "../models/User";
import { IOrder } from "../models/Order";
import { IMenuItem } from "../models/MenuItem";
import { PaymentMethods } from "../models/Payment";
import { logger } from "../config/pino";

const PAYMOB_API_KEY = process.env.PAYMOB_API_KEY;
const PAYMOB_MOTO_INTEGRATION_ID = +process.env.PAYMOB_MOTO_INTEGRATION_ID!;
const PAYMOB_DEFAULT_INTEGRATION_ID =
  +process.env.PAYMOB_DEFAULT_INTEGRATION_ID!;
const PAYMOB_WALLET_INTEGRATION_ID = +process.env.PAYMOB_WALLET_INTEGRATION_ID!;
// Paymob's recommended integration for the *first* transaction of a
// free-trial subscription: it authorises the amount and voids it
// automatically, so the customer is verified without being charged at
// signup. Confirmed by Paymob support 2026-08-05.
const PAYMOB_VERIFICATION_INTEGRATION_ID =
  +process.env.PAYMOB_VERIFICATION_INTEGRATION_ID!;
const PAYMOB_SECRET_KEY = process.env.PAYMOB_SECRET_KEY;
const PAYMOB_PUBLIC_KEY = process.env.PAYMOB_PUBLIC_KEY;
const SUBSCRIPTION_WEBHOOK_URL = process.env.SUBSCRIPTION_WEBHOOK_URL;
const ORDER_WEBHOOK_URL = process.env.ORDER_WEBHOOK_URL;
const PAYMOB_BASE_URL = "https://accept.paymob.com";

// Paymob's `frequency` is a fixed choice field, not a free day count. Sending
// a value outside the enum is rejected with `"<value>" is not a valid choice`.
// Yearly is **360**, not 365 — the calendar-intuitive 365 was silently making
// every yearly plan impossible to create, since the failure only surfaced when
// a plan was actually created and no plan of any kind could be created at all
// until the MOTO integration arrived on 2026-08-05.
//
// The full enum, read from the API itself (`OPTIONS
// /api/acceptance/subscription-plans` exposes the choices as field metadata):
//   0 One-time/Immediate · 1 Daily · 7 weekly · 15 Biweekly · 30 Monthly
//   60 BiMonthly · 90 Quarterly · 180 Half annual · 360 Yearly
// Only monthly and yearly are reachable from `IPlan["frequency"]`.
const frequencyMap = {
  weekly: 7,
  monthly: 30,
  yearly: 360,
};

interface ICreatePlan {
  planName: string;
  frequency: string;
  planType?: string;
  amountInCents: number;
  isActive: boolean;
}

/**
 * Unset integration IDs parse to `NaN` (`+undefined`), which Paymob rejects
 * with an opaque "Integration ID/Name does not exist in our system" — so
 * surface it as a configuration error the operator can act on instead.
 */
function requireIntegration(id: number, envVarName: string): number {
  if (Number.isNaN(id)) {
    logger.error(
      `${envVarName} is not set — the Paymob call requiring it cannot be made.`,
    );
    throw new UnprocessableError({
      ar: "طريقة الدفع هذه غير مهيأة حاليًا",
      en: "This payment method is not currently configured",
    });
  }
  return id;
}

export async function paymobLogin() {
  try {
    const authRes = await axios.post(`${PAYMOB_BASE_URL}/api/auth/tokens`, {
      api_key: PAYMOB_API_KEY,
    });
    const token = authRes.data.token;
    return token;
  } catch {
    throw new UnprocessableError({
      ar: "خطأ في تسجيل الدخول إلى paymob",
      en: "Error in login to paymob",
    });
  }
}

export async function createSubscriptionPlan({
  planName,
  frequency,
  planType = "rent",
  amountInCents,
  isActive,
}: ICreatePlan) {
  // The plan itself must be created against the MOTO integration — that is
  // what Paymob uses for the automatic recurring deductions. The customer
  // never sees it; the first payment goes through a different integration
  // (see createSubscriptionIntent).
  const integration = requireIntegration(
    PAYMOB_MOTO_INTEGRATION_ID,
    "PAYMOB_MOTO_INTEGRATION_ID",
  );

  try {
    const token = await paymobLogin();

    const plan = await axios.post(
      `${PAYMOB_BASE_URL}/api/acceptance/subscription-plans`,
      {
        name: planName,
        frequency: frequencyMap[frequency as keyof typeof frequencyMap],
        plan_type: planType,
        amount_cents: amountInCents,
        // Always false: false bills the plan's own `amount_cents` on every
        // cycle, true bills whatever the *first* transaction charged. With a
        // free trial the first transaction is a zero-cost verification hold,
        // so true would lock the subscription to the wrong amount forever;
        // without a trial the two are equal anyway. Paymob confirmed false is
        // correct for our case (2026-08-05) — this used to send
        // `!startWithTrial`, i.e. true on every non-trial plan.
        use_transaction_amount: false,
        is_active: isActive,
        integration,
        webhook_url: SUBSCRIPTION_WEBHOOK_URL,
        // Days to wait before making a *single* retry attempt after a failed
        // renewal — not a count of attempts (Paymob, 2026-08-05). A failed
        // renewal does not suspend or cancel the subscription on its own.
        retrial_days: 3,
        // Days before the billing date that Paymob emails the customer a
        // reminder.
        reminder_days: 3,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return plan.data;
  } catch (error) {
    if (error instanceof AxiosError) {
      logger.error(
        { paymob: error.response?.data },
        "Paymob subscription-plan creation failed",
      );
    }
    throw new UnprocessableError({
      ar: "خطأ في إنشاء خطة اشتراك paymob",
      en: "Error in create subscription plan to paymob",
    });
  }
}

export async function createSubscriptionIntent({
  plan,
  user,
  trialDays,
  extras,
}: {
  plan: IPlan;
  user: IUser;
  trialDays: number;
  extras?: Record<string, string>;
}) {
  // Which integration handles the *first* transaction. With a free trial we
  // must not actually charge the customer at signup, so Paymob's guidance is
  // to use a Verification integration: it authorises the amount and voids it
  // automatically. Without a trial it's a normal 3DS card payment.
  //
  // This is the fix for a real bug: every trial signup previously went
  // through the card integration and was charged the full plan price on day
  // one, making the advertised free trial not free.
  const firstTransactionIntegration =
    trialDays > 0
      ? requireIntegration(
          PAYMOB_VERIFICATION_INTEGRATION_ID,
          "PAYMOB_VERIFICATION_INTEGRATION_ID",
        )
      : requireIntegration(
          PAYMOB_DEFAULT_INTEGRATION_ID,
          "PAYMOB_DEFAULT_INTEGRATION_ID",
        );

  try {
    const startDate = new Date(Date.now() + trialDays * 86400000)
      .toISOString()
      .split("T")[0]; // format: YYYY-MM-DD
    const sub = await axios.post(
      `${PAYMOB_BASE_URL}/v1/intention/`,
      {
        currency: plan.currency,
        amount: plan.price * 100, //cents
        subscription_plan_id: plan.paymobPlanId,
        payment_methods: [firstTransactionIntegration],
        items: [
          {
            name: plan.title,
            description: plan.description,
            amount: plan.price * 100, //cents
            quantity: 1,
          },
        ],
        billing_data: {
          email: user.email,
          phone_number: user.phoneNumber,
          first_name: user.firstName,
          last_name: user.lastName,
        },

        customer: {
          first_name: user.firstName,
          last_name: user.lastName,
          email: user.email,
          extras: {
            userId: user._id.toString(),
          },
        },
        // For a free trial this is the date the *paid* subscription starts,
        // i.e. the trial end date.
        ...(trialDays > 0 && { subscription_start_date: startDate }),
        // `special_reference` is deliberately left unset so Paymob generates
        // its own: it must be unique per transaction, and a subscription can
        // legitimately be re-attempted by the same user for the same plan.
        extras,
      },
      {
        headers: {
          // `Token`, not `Bearer` — Paymob confirmed (2026-08-05) that
          // `Authorization: Token <secret_key>` is the only supported format
          // for the Intention API. createPaymentIntent already used it; this
          // one didn't.
          Authorization: `Token ${PAYMOB_SECRET_KEY}`,
        },
      },
    );

    const iframeUrl = ` https://accept.paymob.com/unifiedcheckout/?publicKey=${PAYMOB_PUBLIC_KEY}&clientSecret=${sub.data.client_secret}`;

    return {
      iframeUrl,
      paymobSubscription: sub.data,
    };
  } catch (error) {
    if (error instanceof AxiosError) {
      logger.error(
        { paymob: error.response?.data },
        "Paymob subscription intent creation failed",
      );
    }
    throw new UnprocessableError({
      ar: "خطأ في إنشاء صفحة الاشتراك في paymob",
      en: "Error in creating subscription intent to paymob",
    });
  }
}

/**
 * Maps the customer's chosen payment method onto the Paymob integration that
 * can actually process it. Throws a configuration error rather than silently
 * falling back to the card integration, which would charge the customer
 * through a channel they didn't pick.
 */
function integrationForPaymentMethod(method: PaymentMethods): number {
  switch (method) {
    case PaymentMethods.CreditCard:
    case PaymentMethods.DebitCard:
      return requireIntegration(
        PAYMOB_DEFAULT_INTEGRATION_ID,
        "PAYMOB_DEFAULT_INTEGRATION_ID",
      );
    // All three mobile wallets go through the single Paymob wallet
    // integration; the customer picks their provider on Paymob's own page.
    case PaymentMethods.VodafoneCash:
    case PaymentMethods.OrangeMoney:
    case PaymentMethods.EtisalatWallet:
      return requireIntegration(
        PAYMOB_WALLET_INTEGRATION_ID,
        "PAYMOB_WALLET_INTEGRATION_ID",
      );
    // Fawry, BankTransfer and Cash have no configured integration. Cash in
    // particular must never get here — createOrderHandler settles it offline.
    default:
      logger.error(
        `No Paymob integration is configured for payment method "${method}".`,
      );
      throw new UnprocessableError({
        ar: "طريقة الدفع هذه غير مهيأة حاليًا",
        en: "This payment method is not currently configured",
      });
  }
}

export async function createPaymentIntent({
  order,
  customer,
  shopName,
}: {
  order: IOrder;
  shopName: string;
  customer: {
    first_name: string;
    last_name: string;
    phone_number: string;
  };
}) {
  // Only offer the integration matching what the customer actually chose at
  // checkout, rather than every configured integration regardless of
  // selection. `Cash` never reaches here — it's settled in person and skips
  // Paymob entirely (see controllers/order.controller.ts); Paymob's Cash
  // Collection integration is a different product (pay at an outlet) and is
  // not supported on Unified Checkout, which is the only checkout we use.
  const paymentMethods = [integrationForPaymentMethod(order.paymentMethod)];

  try {
    const paymentIntent = await axios.post(
      `${PAYMOB_BASE_URL}/v1/intention`,
      {
        currency: "EGP",
        amount: order.totalAmount * 100, //cents
        payment_methods: paymentMethods,
        items: order.orderItems.map((item) => ({
          name:
            (item.menuItem as IMenuItem).name.en ||
            (item.menuItem as IMenuItem).name.ar,
          description:
            (item.menuItem as IMenuItem).description?.en ||
            (item.menuItem as IMenuItem).description?.ar,
          amount: item.price * 100, //cents
          quantity: item.quantity,
        })),
        billing_data: {
          phone_number: customer.phone_number,
          first_name: customer.first_name,
          last_name: customer.last_name,
        },
        customer: {
          first_name: customer.first_name,
          last_name: customer.last_name,
          phone_number: customer.phone_number,
        },
        // Must be unique per *transaction*, not per order (Paymob,
        // 2026-08-05) — a customer whose card is declined and who retries
        // would otherwise collide with their own first attempt and be unable
        // to pay at all. The order id stays as the stable, queryable prefix;
        // `extras.orderId` below is what the webhook actually reconciles on,
        // so the suffix costs us nothing.
        special_reference: `${order._id.toString()}-${Date.now().toString(36)}`,
        extras: {
          orderId: order._id.toString(),
        },
        notification_url: ORDER_WEBHOOK_URL,
        redirection_url: `${process.env.FRONTEND_URL}/shops/${shopName}/orders/checkout/${order.orderNumber}`,
      },
      {
        headers: {
          Authorization: `Token ${PAYMOB_SECRET_KEY}`,
        },
      },
    );

    const iframeUrl = `https://accept.paymob.com/unifiedcheckout/?publicKey=${PAYMOB_PUBLIC_KEY}&clientSecret=${paymentIntent.data.client_secret}`;

    return {
      iframeUrl,
      paymobPayment: paymentIntent.data,
    };
  } catch (error) {
    if (error instanceof AxiosError) {
      const msg = error.response?.data.message || "Unknown error";
      logger.error(msg);
    }
    throw new UnprocessableError({
      ar: "خطأ في إنشاء صفحة الدفع في paymob",
      en: "Error in creating payment intent to paymob",
    });
  }
}
//cancle subscription

export async function cancelPaymobSubscription(paymobSubscriptionId: number) {
  try {
    const token = await paymobLogin();
    const cancelSubscription = await axios.post(
      `${PAYMOB_BASE_URL}/api/acceptance/subscriptions/${paymobSubscriptionId}/cancel`,
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return cancelSubscription.data;
  } catch (error) {
    if (error instanceof AxiosError) {
      const msg = error.response?.data?.message || "Unknown error";
      logger.error(msg);
    }
    throw new UnprocessableError({
      ar: "خطأ في إلغاء الاشتراك في paymob",
      en: "Error in canceling paymob subscription",
    });
  }
}

/**
 * Voids an authorised-but-not-captured transaction. This is NOT the same as a
 * refund and is not interchangeable with it: once Paymob has settled the
 * transaction, `/void` fails and only `/refund` works. Kept exported for the
 * verification-hold path (free-trial signups), which Paymob voids
 * automatically but which we may need to void by hand if that ever stalls.
 */
export async function voidTransaction(transactionId: string) {
  return callVoidRefund(
    "void",
    { transaction_id: transactionId },
    {
      ar: "خطأ في إلغاء المعاملة في paymob",
      en: "Error in voiding transaction in paymob",
    },
  );
}

/**
 * Refunds a settled transaction, fully or partially. `amountCents` is
 * required by Paymob; the cumulative total refunded so far comes back on the
 * transaction as `refunded_amount_cents`.
 *
 * This replaces the old `refundOrder()`, which was called on order
 * cancellation but posted to the **void** endpoint with no amount — so
 * cancelling any order Paymob had already settled failed, and the customer
 * was never refunded.
 */
export async function refundTransaction(
  transactionId: string,
  amountCents: number,
) {
  return callVoidRefund(
    "refund",
    {
      transaction_id: transactionId,
      amount_cents: amountCents,
    },
    {
      ar: "خطأ في رد الطلب في paymob",
      en: "Error in refunding order in paymob",
    },
  );
}

async function callVoidRefund(
  action: "void" | "refund",
  body: Record<string, string | number>,
  errorMessage: { ar: string; en: string },
) {
  try {
    const response = await axios.post(
      `${PAYMOB_BASE_URL}/api/acceptance/void_refund/${action}`,
      body,
      {
        headers: {
          Authorization: `Token ${PAYMOB_SECRET_KEY}`,
        },
      },
    );
    return response.data;
  } catch (error) {
    if (error instanceof AxiosError) {
      logger.error(
        { paymob: error.response?.data, action, body },
        `Paymob ${action} failed`,
      );
    }
    throw new UnprocessableError(errorMessage);
  }
}
