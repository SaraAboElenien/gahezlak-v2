import { RequestHandler } from "express";
import { Errors } from "../errors";
import { errMsg } from "../common/err-messages";

import { logger } from "../config/pino";
import { Subscriptions, SubscriptionStatus } from "../models/Subscription";
import { Shops } from "../models/Shop";
import { Plans } from "../models/Plan";
import { PaymobWebhookPayload } from "../common/types/general-types";
import {
  verifyPaymobSubscriptionHmac,
  verifyPaymobCallbackHMAC,
} from "../utils/paymob-hmac-verification";
import { Orders, OrderStatus } from "../models/Order";
import { PaymentMethods } from "../models/Payment";

/**
 * The `obj` payload Paymob sends on a `type: "TRANSACTION"` webhook. Only the
 * fields this controller actually reads are modelled; Paymob sends many more.
 */
interface PaymobTransactionObject {
  id: number;
  success: boolean;
  pending?: boolean;
  payment_key_claims: {
    subscription_plan_id?: number | null;
    subscription_start_date?: string | null;
    extra: Record<string, string | undefined>;
  };
}

/**
 * Subscription-lifecycle webhooks. Paymob also stamps a top-level `created_at`
 * on some of these, which is not part of the documented payload shape modelled
 * in `PaymobWebhookPayload` — hence the optional field plus the fallback in
 * `handleSubscriptionRenewed`.
 */
type PaymobSubscriptionWebhook = PaymobWebhookPayload & {
  created_at?: string;
};

export const handlePaymobSubscriptionWebhook: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const webhookData = req.body;

    const isValidSuscriptionHmac = verifyPaymobSubscriptionHmac(webhookData);

    const isValidCallbackHMAC = verifyPaymobCallbackHMAC(
      webhookData.obj,
      (req.query.hmac as string) || "",
    );

    if (!isValidSuscriptionHmac && !isValidCallbackHMAC) {
      throw new Errors.BadRequestError(errMsg.INVALID_HMAC_SIGNATURE);
    }
    logger.info(
      "Paymob Subscription Webhook received",
      webhookData.trigger_type,
    );

    if (webhookData.type === "TRANSACTION") {
      await handleTransactionProcessed(webhookData.obj);
    } else if (webhookData.trigger_type) {
      const trigger = webhookData.trigger_type.toLowerCase();

      // Paymob confirmed the complete `trigger_type` list on 2026-08-05:
      //   "Subscription Created", "suspended", "canceled", "resumed",
      //   "updated", "add_secondry_card", "change_primary_card",
      //   "delete_card", "register_webhook", "Successful Transaction"
      //   (renewal), "Failed Transaction", "Failed Overdue Transaction".
      // The payload shape is identical across all of them; only
      // `trigger_type` and `state` differ.
      //
      // This also settles the KNOWN_ISSUES.md entry claiming cancellations
      // were silently dropped because the real value was "Subscription
      // Cancelled" (two L's): it is not — it is literally "canceled", and
      // the renewal trigger is "Successful Transaction". Both branches below
      // always did match. That entry was a false alarm and has been removed.
      if (trigger.includes("created")) {
        await handleSubscriptionCreated(webhookData);
      } else if (trigger.includes("canceled")) {
        await handleSubscriptionCancelled(webhookData);
      } else if (trigger.includes("successful transaction")) {
        await handleSubscriptionRenewed(webhookData);
      } else if (trigger.includes("suspended")) {
        await handleSubscriptionSuspended(webhookData);
      } else if (trigger.includes("resumed")) {
        await handleSubscriptionResumed(webhookData);
      } else if (trigger.includes("failed")) {
        // "Failed Transaction" and "Failed Overdue Transaction" (a failed
        // retry). Paymob confirmed neither suspends nor cancels the
        // subscription on its own, so we deliberately change no state here —
        // but a shop silently sliding towards non-payment is worth seeing in
        // the logs rather than discarding.
        logger.warn(
          `Paymob reported "${webhookData.trigger_type}" for subscription ${webhookData.subscription_data?.id}. Subscription state left unchanged, per Paymob's documented behaviour.`,
        );
      } else {
        // Card-management and registration triggers (add_secondry_card,
        // change_primary_card, delete_card, register_webhook, updated) carry
        // no state we mirror locally.
        logger.info(
          `Unhandled Paymob subscription trigger: ${webhookData.trigger_type}`,
        );
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
};

async function handleTransactionProcessed(data: PaymobTransactionObject) {
  if (!data.success || !data.payment_key_claims.subscription_plan_id) {
    return;
  }

  const { shopId, planId } = data.payment_key_claims.extra;

  if (!shopId || !planId) {
    logger.error(
      "Webhook (Transaction): Critical - Missing shopId or planId in extras.",
      data.payment_key_claims.extra,
    );
    return;
  }

  // Find the PENDING subscription you created before payment
  const subscription = await Subscriptions.findOne({
    shop: shopId,
    status: SubscriptionStatus.PENDING,
  });
  const plan = await Plans.findById(planId);

  if (!subscription || !plan) {
    logger.error(
      `Webhook (Transaction): Pending subscription or Plan not found for shop ${shopId}.`,
    );
    return;
  }

  // ACTIVATE the subscription
  subscription.status =
    plan.trialPeriodDays > 0
      ? SubscriptionStatus.TRIALING
      : SubscriptionStatus.ACTIVE;
  subscription.paymobTransactionId = data.id; // The ID of this specific payment

  // The start date of the trial/subscription is 'now' or the date from Paymob
  subscription.currentPeriodStart = new Date();
  if (
    plan.trialPeriodDays > 0 &&
    data.payment_key_claims.subscription_start_date
  ) {
    subscription.currentPeriodEnd = new Date(
      data.payment_key_claims.subscription_start_date,
    );
  } else {
    // If no trial, calculate the end date based on plan frequency
    const endDate = new Date(subscription.currentPeriodStart);
    if (plan.frequency === "monthly") {
      endDate.setMonth(endDate.getMonth() + 1);
    } else {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }
    subscription.currentPeriodEnd = endDate;
  }

  subscription.isTrialUsed = plan.trialPeriodDays > 0;

  await subscription.save();
  logger.info(
    `Subscription for shop ${shopId} ACTIVATED via Transaction ID ${data.id}.`,
  );
}

async function handleSubscriptionCreated(payload: PaymobSubscriptionWebhook) {
  const { subscription_data, transaction_id } = payload;

  const subscription = await Subscriptions.findOne({
    paymobTransactionId: transaction_id,
  });

  if (!subscription) {
    logger.warn(
      `Webhook (Subscription Created): Could not find an activated subscription for transaction_id ${transaction_id}. It might be processed with a slight delay.`,
    );
    return;
  }

  if (subscription.paymobSubscriptionId) {
    return;
  }

  subscription.paymobSubscriptionId = subscription_data.id;
  await subscription.save();
  await Shops.findByIdAndUpdate(subscription.shop, {
    $set: {
      subscriptionId: subscription._id,
    },
  });

  logger.info(
    `Paymob Subscription ID ${subscription_data.id} saved for local subscription ${subscription._id}.`,
  );
  logger.info(
    `Shop ${subscription.shop} subscription updated with Paymob Subscription ID ${subscription_data.id}.`,
  );
}

async function handleSubscriptionCancelled(data: PaymobSubscriptionWebhook) {
  const { subscription_data } = data;

  const subscription = await Subscriptions.findOneAndUpdate(
    { paymobSubscriptionId: subscription_data.id },
    {
      status: SubscriptionStatus.CANCELLED,
      cancelledAt: new Date(),
      // Keep currentPeriodEnd as is - they can use service until period ends
    },
  );

  logger.info(
    `Subscription cancelled: ${subscription?.id} for Paymob Subscription ID ${subscription_data.id} for shop ${subscription?.shop}`,
  );
}

/**
 * Paymob suspended the subscription (an explicit action on their side — a
 * failed renewal alone does not cause this).
 *
 * There is no dedicated SUSPENDED status locally, so this maps onto EXPIRED,
 * whose meaning — "past due, access revoked" — is what a suspension amounts
 * to for the shop. Adding a distinct status would touch the model, the
 * subscription-check middleware and the dashboard UI; worth doing if
 * suspensions turn out to be common, but not worth guessing at now.
 */
async function handleSubscriptionSuspended(data: PaymobSubscriptionWebhook) {
  const { subscription_data } = data;

  const subscription = await Subscriptions.findOneAndUpdate(
    { paymobSubscriptionId: subscription_data.id },
    { status: SubscriptionStatus.EXPIRED },
  );

  if (!subscription) {
    logger.warn(
      `Webhook (Suspended): No local subscription for Paymob ID ${subscription_data.id}.`,
    );
    return;
  }

  logger.info(
    `Subscription ${subscription._id} for shop ${subscription.shop} suspended by Paymob.`,
  );
}

/** Paymob resumed a previously suspended subscription. */
async function handleSubscriptionResumed(data: PaymobSubscriptionWebhook) {
  const { subscription_data } = data;

  const subscription = await Subscriptions.findOneAndUpdate(
    { paymobSubscriptionId: subscription_data.id },
    { status: SubscriptionStatus.ACTIVE },
  );

  if (!subscription) {
    logger.warn(
      `Webhook (Resumed): No local subscription for Paymob ID ${subscription_data.id}.`,
    );
    return;
  }

  logger.info(
    `Subscription ${subscription._id} for shop ${subscription.shop} resumed.`,
  );
}

async function handleSubscriptionRenewed(data: PaymobSubscriptionWebhook) {
  const { subscription_data, transaction_id } = data;

  if (!subscription_data.id) {
    logger.error(
      "Webhook (Renewal): Missing subscription_id in transaction data.",
    );
    return;
  }

  // Find the active subscription using the ID from Paymob
  const subscription = await Subscriptions.findOne({
    paymobSubscriptionId: subscription_data.id,
  });

  if (!subscription) {
    logger.warn(
      `Webhook (Renewal): Could not find subscription with Paymob ID ${subscription_data.id}.`,
    );
    return;
  }

  const plan = await Plans.findById(subscription.plan);
  if (!plan) {
    logger.error(
      `Webhook (Renewal): Could not find plan ${subscription.plan} for subscription ${subscription._id}.`,
    );

    return;
  }

  // `data.created_at` is not part of the documented subscription-webhook
  // payload (see PaymobWebhookPayload) — only `subscription_data.created_at`
  // is. Falling back to it keeps the existing behaviour when Paymob does send
  // the top-level field, and stops an unparseable date being written into the
  // subscription's billing period when it doesn't.
  const newPeriodStart = new Date(
    data.created_at ?? subscription_data.created_at,
  );
  if (Number.isNaN(newPeriodStart.getTime())) {
    logger.error(
      `Webhook (Renewal): Unparseable renewal date for subscription ${subscription._id}; refusing to write an invalid billing period.`,
    );
    return;
  }
  const newPeriodEnd = new Date(newPeriodStart);

  if (plan.frequency === "monthly") {
    newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);
  } else if (plan.frequency === "yearly") {
    newPeriodEnd.setFullYear(newPeriodEnd.getFullYear() + 1);
  } else {
    logger.error(
      `Webhook (Renewal): Unknown plan frequency "${plan.frequency}".`,
    );
    return;
  }

  subscription.status = SubscriptionStatus.ACTIVE;
  subscription.currentPeriodStart = newPeriodStart;
  subscription.currentPeriodEnd = newPeriodEnd;
  subscription.paymobTransactionId = transaction_id; // Update to the latest transaction ID

  await subscription.save();

  logger.info(
    `Subscription ${subscription._id} for shop ${
      subscription.shop
    } renewed successfully. New period: ${newPeriodStart.toISOString()} to ${newPeriodEnd.toISOString()}.`,
  );
}

export const handlePaymobOrdersWebhook: RequestHandler = async (req, res) => {
  const { obj } = req.body;

  const isValid = verifyPaymobCallbackHMAC(obj, req.query.hmac as string);

  if (!isValid) {
    throw new Errors.BadRequestError(errMsg.INVALID_HMAC_SIGNATURE);
  }

  const transactionId = obj?.id;
  const orderId = obj?.payment_key_claims.extra.orderId;

  const isPaid = obj.success && !obj.pending;

  if (isPaid) {
    await handleOrderPaid(orderId, transactionId, obj?.source_data?.type);
    logger.info(`Order paid: ${orderId}`);
  } else {
    // Previously logged "Order paid" unconditionally, including for
    // transactions Paymob reported as pending or failed — actively misleading
    // when reading logs to work out why an order never got confirmed.
    logger.info(
      `Order ${orderId} not confirmed — Paymob reported success=${obj.success}, pending=${obj.pending}`,
    );
  }
  res.status(200).json({ message: "Webhook processed" });
  return;
};

/**
 * Paymob reports how the transaction was actually paid in `source_data.type`
 * — the broad channel, e.g. "card" / "wallet" / "cash". We only use it to
 * detect a contradiction, not to set the stored method: see below.
 */
function contradictsStoredMethod(
  stored: PaymentMethods | undefined,
  sourceType: string | undefined,
): boolean {
  if (!stored || !sourceType) return false;
  const storedIsCash = stored === PaymentMethods.Cash;
  const paidByCash = sourceType.toLowerCase() === "cash";
  return storedIsCash !== paidByCash;
}

async function handleOrderPaid(
  orderId: string,
  transactionId: string,
  sourceType?: string,
) {
  // `paymentMethod` is deliberately NOT written here. It is set when the order
  // is created, from the customer's validated selection (see
  // validators/order.validator.ts), and `createPaymentIntent` chooses which
  // Paymob integration to use *from that same value* — so the stored value
  // already describes how the order was paid. This used to unconditionally
  // stamp `CreditCard` on every paid order, which silently destroyed that
  // selection: once cash and wallet integrations go live, every order would
  // have been mislabelled as card, and any revenue reporting built on the
  // field would have been wrong with no trace of the original value.
  //
  // Paymob's `source_data.sub_type` could in principle narrow card payments
  // to credit vs debit, but the exact strings it emits per integration type
  // are undocumented and currently the subject of an open support ticket —
  // guessing them is what caused the subscription-cancellation webhook to
  // silently no-op (see KNOWN_ISSUES.md). So we log a contradiction rather
  // than acting on a guess.
  const order = await Orders.findByIdAndUpdate(
    orderId,
    {
      orderStatus: OrderStatus.Confirmed,
      paymobTransactionId: transactionId,
    },
    { new: false },
  );

  if (order && contradictsStoredMethod(order.paymentMethod, sourceType)) {
    logger.warn(
      `Order ${orderId} is stored as paymentMethod "${order.paymentMethod}" but Paymob reported source_data.type "${sourceType}". Leaving the stored value untouched — investigate before trusting this order's payment method.`,
    );
  }

  return order;
}
