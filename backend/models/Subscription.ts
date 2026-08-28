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
 * How long a subscription still marked ACTIVE keeps working past its
 * `currentPeriodEnd`.
 *
 * ACTIVE is gated on the clock like every other status, but the date it is
 * gated on is advanced by an *external* event: Paymob's renewal webhook
 * (`handleSubscriptionRenewed`) rewrites both period fields when a renewal
 * settles. That makes an ungraced gate dangerous in the deny direction, in a
 * way the TRIALING fix was not. Three paths in that handler return early
 * *after* the customer has already been charged (plan row missing, unparseable
 * renewal date, unrecognised plan frequency); `handleSubscriptionResumed` sets
 * ACTIVE without touching the period at all; and webhook delivery is not
 * guaranteed in the first place — this project has twice shipped with a
 * webhook URL that was never set. Any one of those would otherwise take a
 * fully paid-up restaurant off the air at midnight, which is a worse failure
 * than the one being fixed here.
 *
 * So ACTIVE gets a grace window and TRIALING/CANCELLED deliberately do not.
 * That asymmetry is the point rather than an oversight: nothing external is
 * ever expected to move *their* dates. A trial's end is final, and a
 * cancellation's end was already known at the moment it was written. Only
 * ACTIVE is waiting on a message that might not arrive.
 *
 * Three days covers a dropped webhook plus a redeploy window without letting an
 * abandoned subscription trade indefinitely. It does not need to cover Paymob's
 * whole dunning cycle: Paymob suspends genuinely delinquent subscriptions, and
 * that webhook writes EXPIRED — which no grace period admits.
 */
export const ACTIVE_GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * The instant an ACTIVE subscription's `currentPeriodEnd` must still be after.
 *
 * Expressed as a shifted cutoff (`end > now - grace`) rather than a shifted end
 * (`end + grace > now`) because those are algebraically identical and only the
 * first can be handed to Mongo as a `$gt`. Both encodings below call this, so
 * the window cannot drift between them.
 */
function activeGraceCutoff(now: Date): Date {
  return new Date(now.getTime() - ACTIVE_GRACE_PERIOD_MS);
}

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
    // ACTIVE used to return `true` unconditionally, which is the same shape of
    // bug the TRIALING branch below had: a subscription whose payment quietly
    // stopped kept full access forever, because nothing in this codebase ever
    // re-examines the clock and there is no scheduler of any kind. See
    // ACTIVE_GRACE_PERIOD_MS for why this branch alone gets a grace window.
    case SubscriptionStatus.ACTIVE:
      return subscription.currentPeriodEnd > activeGraceCutoff(now);
    // TRIALING is gated on the clock exactly as CANCELLED is. It used to
    // return `true` unconditionally, which meant a free trial never ended:
    // nothing anywhere transitions `trialing` -> `expired` (the only writer
    // of EXPIRED is the Paymob "suspended" webhook, which by definition
    // cannot fire for a trial that never converted to billing, and this
    // project has no cron or scheduler of any kind). The deployed shop was
    // still taking orders ten days past its trial end when this was found.
    //
    // Note this deliberately fixes the *re-subscribe* guard at the same time,
    // because `entitledToServiceFilter` below is the same rule and
    // `createOrUpdatePendingSubscription` refuses to sell a plan to a shop
    // that is still entitled. Gating access without gating that would leave a
    // lapsed trial locked out AND unable to pay — which is precisely the
    // cancelled-mid-period trap fixed on 2026-08-19. One predicate, one
    // answer: that is the whole point of these two functions living together.
    case SubscriptionStatus.TRIALING:
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
      // Mirrors the ACTIVE branch of isEntitledToService above, grace window
      // included — an ACTIVE row is entitled only while its period, extended
      // by ACTIVE_GRACE_PERIOD_MS, is still running.
      {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: { $gt: activeGraceCutoff(now) },
      },
      // Mirrors the TRIALING/CANCELLED branch — both are entitled only while
      // their paid-for period is still running, with no grace.
      {
        status: {
          $in: [SubscriptionStatus.TRIALING, SubscriptionStatus.CANCELLED],
        },
        currentPeriodEnd: { $gt: now },
      },
    ],
  };
}
