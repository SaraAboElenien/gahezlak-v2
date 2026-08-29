import mongoose, { Schema, Types } from "mongoose";
import { collectionsName } from "../common/collections-name";

/**
 * A settled money movement, recorded once, at the moment we learn about it.
 *
 * WHY THIS EXISTS. Platform revenue used to be derived by summing the `price`
 * of every subscription whose billing period fell inside the reporting window.
 * That is not a record of money; it is a re-derivation from current state, and
 * it was wrong in both directions — it excluded every still-running
 * subscription (containment rather than overlap), and it would silently change
 * the past whenever a plan's price was edited. There was nothing to aggregate
 * over instead: `models/Payment.ts` no longer defines a model, and
 * `Subscription.paymobTransactionId` holds only the most recent id, overwritten
 * on every renewal. So prior transactions were not recorded anywhere at all.
 *
 * The product decision (owner, 2026-08-25) is that revenue is counted at the
 * **settled transaction date**, not derived from subscription periods. This
 * collection is what that decision requires. See DECISIONS.md ADR-018.
 */
export enum PaymentTransactionKind {
  /** First captured charge for a subscription. Absent for trial signups. */
  SUBSCRIPTION_INITIAL = "subscription_initial",
  /** A recurring charge Paymob took against an existing mandate. */
  SUBSCRIPTION_RENEWAL = "subscription_renewal",
  /** A diner paying a restaurant. Belongs to the shop, not the platform. */
  ORDER = "order",
}

/**
 * Which kinds count as *platform* income.
 *
 * Order payments are deliberately excluded: that money is the restaurant's,
 * and counting it as platform revenue would overstate the business by roughly
 * the entire GMV. They are recorded here anyway because they are the only
 * durable record that a given order was actually settled — `Order` carries a
 * status and a transaction id, but nothing that survives the order being
 * edited or the status being moved by hand.
 */
export const PLATFORM_REVENUE_KINDS = [
  PaymentTransactionKind.SUBSCRIPTION_INITIAL,
  PaymentTransactionKind.SUBSCRIPTION_RENEWAL,
] as const;

export interface IPaymentTransaction {
  kind: PaymentTransactionKind;
  shopId: Types.ObjectId;
  subscriptionId?: Types.ObjectId;
  planId?: Types.ObjectId;
  orderId?: Types.ObjectId;
  /**
   * Major currency units (EGP), matching `Plan.price` and `Order.totalAmount`.
   * Paymob reports `amount_cents`; the conversion happens once, at the webhook
   * boundary, so nothing downstream has to remember which unit it is holding.
   */
  amount: number;
  currency: string;
  /**
   * Paymob's transaction id, and the idempotency key for this whole
   * collection. Paymob retries a webhook it did not get a 200 for, and a
   * retried renewal that inserted a second row would inflate reported revenue
   * with no way to tell the duplicate from a genuine second charge. The unique
   * index is what makes a redelivery a no-op instead.
   */
  paymobTransactionId: number;
  /** The instant revenue is counted at. */
  settledAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentTransactionSchema = new Schema<IPaymentTransaction>(
  {
    kind: {
      type: String,
      enum: Object.values(PaymentTransactionKind),
      required: true,
    },
    shopId: {
      type: Schema.Types.ObjectId,
      ref: collectionsName.SHOPS,
      required: true,
    },
    subscriptionId: {
      type: Schema.Types.ObjectId,
      ref: collectionsName.SUBSCRIPTIONS,
    },
    planId: {
      type: Schema.Types.ObjectId,
      ref: collectionsName.PLANS,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: collectionsName.ORDERS,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      default: "EGP",
    },
    paymobTransactionId: {
      type: Number,
      required: true,
      unique: true,
    },
    settledAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

// The reporting query is always "these kinds, in this window", so the index
// leads with `kind` and then orders by `settledAt` within it.
PaymentTransactionSchema.index({ kind: 1, settledAt: 1 });
// Per-shop history, for the shop-facing figures and for support questions.
PaymentTransactionSchema.index({ shopId: 1, settledAt: -1 });

export const PaymentTransactions = mongoose.model<IPaymentTransaction>(
  "PaymentTransaction",
  PaymentTransactionSchema,
  collectionsName.PAYMENT_TRANSACTIONS,
);
