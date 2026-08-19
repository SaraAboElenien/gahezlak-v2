import mongoose, { Schema, ObjectId } from "mongoose";
import { collectionsName } from "../common/collections-name";
import { IShop } from "./Shop";
import { IPlan } from "./Plan";

export enum SubscriptionStatus {
  TRIALING = "trialing",
  ACTIVE = "active", // Actively paid
  PENDING = "pending", // Waiting for initial payment confirmation
  CANCELLED = "cancelled", // User cancelled, will expire at period end
  EXPIRED = "expired", // Past due, access revoked
}

export interface ISubscription {
  userId: ObjectId;
  shop: ObjectId | IShop;
  plan: ObjectId | IPlan; // Link to the plan they are on
  status: SubscriptionStatus;
  paymobSubscriptionId?: number; // To manage the subscription in Paymob
  paymobTransactionId?: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date; // A single field to track when the current period (trial or paid) ends
  isTrialUsed: boolean;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: collectionsName.USERS,
      required: true,
    },
    shop: {
      type: Schema.Types.ObjectId,
      ref: collectionsName.SHOPS,
      required: true,
      unique: true,
    },
    plan: {
      type: Schema.Types.ObjectId,
      ref: collectionsName.PLANS,
      required: true,
    },
    status: {
      type: String,
      enum: SubscriptionStatus,
      default: SubscriptionStatus.PENDING,
    },
    paymobSubscriptionId: {
      type: Number,
      // required: true,
    },
    paymobTransactionId: {
      type: Number,
      // required: true,
    },

    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd: { type: Date, required: true },
    isTrialUsed: { type: Boolean, default: false },
    cancelledAt: { type: Date },
  },
  {
    timestamps: true,
    collection: collectionsName.SUBSCRIPTIONS,
  },
);

export const Subscriptions = mongoose.model<ISubscription>(
  collectionsName.SUBSCRIPTIONS,
  SubscriptionSchema,
);

/**
 * The single definition of "may this shop use the service right now".
 *
 * Three call sites used to answer this question and disagreed, which composed
 * into a bug nobody chose: `cancelSubscription` deliberately preserves
 * `currentPeriodEnd` so a shop keeps what it paid for, and the enum above says
 * so ("User cancelled, will expire at period end"), but the access gate
 * admitted only ACTIVE/TRIALING — so access died the instant CANCELLED was
 * written. Meanwhile the re-subscribe guard *did* honour the grace period and
 * refused to sell a new plan. A shop cancelling on day 1 of a paid month spent
 * the remaining 29 days unable to take a single order and unable to buy its
 * way out, with the money already taken.
 *
 * Cancelling stops the renewal, not the period already paid for.
 */
export function isEntitledToService(
  subscription:
    Pick<ISubscription, "status" | "currentPeriodEnd"> | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!subscription) return false;

  switch (subscription.status) {
    case SubscriptionStatus.ACTIVE:
    case SubscriptionStatus.TRIALING:
      return true;
    case SubscriptionStatus.CANCELLED:
      return subscription.currentPeriodEnd > now;
    // PENDING has not been paid for yet; EXPIRED is past due by definition.
    default:
      return false;
  }
}

/**
 * The same rule expressed as a Mongo filter, for callers that decide by query
 * rather than by loading a document first.
 *
 * Kept beside `isEntitledToService` on purpose: two encodings of one rule is
 * precisely how the original three-way disagreement started, so they live
 * together and a test asserts they agree case for case.
 */
export function entitledToServiceFilter(now: Date = new Date()) {
  return {
    $or: [
      {
        status: {
          $in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
        },
      },
      {
        status: SubscriptionStatus.CANCELLED,
        currentPeriodEnd: { $gt: now },
      },
    ],
  };
}
