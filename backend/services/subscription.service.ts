import {
  ISubscription,
  SubscriptionStatus,
  Subscriptions,
  entitledToServiceFilter,
} from "../models/Subscription";
import { Errors } from "../errors";
import { errMsg } from "../common/err-messages";
import { IPlan } from "../models/Plan";
import { cancelPaymobSubscription } from "../utils/paymob";
import mongoose, { FilterQuery, PipelineStage } from "mongoose";

/**
 * Casts a caller-supplied id for use in an aggregation `$match`, rejecting a
 * malformed one with a 400 rather than letting the BSON constructor throw a
 * generic 500 out of the driver.
 */
function toObjectId(value: string, field: string): mongoose.Types.ObjectId {
  if (!mongoose.isValidObjectId(value)) {
    throw new Errors.BadRequestError({
      en: `Invalid ${field}`,
      ar: `${field} غير صالح`,
    });
  }
  return new mongoose.Types.ObjectId(value);
}

export async function createOrUpdatePendingSubscription({
  shopId,
  userId,
  plan,
}: {
  shopId: string;
  userId: string;
  plan: IPlan;
}) {
  // 1. Refuse to sell a second plan to a shop that is still entitled to the
  // one it has. Same rule as the access gate — they used to be separate
  // encodings that disagreed, which is what let a cancelled-but-paid-up shop
  // be simultaneously denied service and denied the chance to re-subscribe.
  const existingValidSub = await Subscriptions.findOne({
    shop: shopId,
    ...entitledToServiceFilter(),
  });

  if (existingValidSub) {
    throw new Errors.UnprocessableError(errMsg.USER_ALREADY_SUBSCRIBED);
  }

  const previousSubWithTrial = await Subscriptions.findOne({
    shop: shopId,
    isTrialUsed: true,
  });
  const isEligibleForTrial = plan.trialPeriodDays > 0 && !previousSubWithTrial;
  const effectiveTrialDays = isEligibleForTrial ? plan.trialPeriodDays : 0;

  const now = new Date();
  const periodEnd = new Date(
    now.getTime() + effectiveTrialDays * 24 * 60 * 60 * 1000,
  );

  const subscription = await Subscriptions.findOneAndUpdate(
    { shop: shopId },
    {
      $set: {
        userId: userId,
        plan: plan._id,
        status: "pending",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        // A latch, never a straight assignment. There is one subscription row
        // per shop, so `previousSubWithTrial` above reads the very row this
        // update overwrites: assigning `isEligibleForTrial` here made the
        // second subscription (correctly refused a trial) erase the evidence
        // that the first had taken one, leaving the third eligible again. A
        // shop could lapse and re-subscribe for free 14 days indefinitely.
        isTrialUsed: Boolean(previousSubWithTrial) || isEligibleForTrial,
      },
      // Must be $unset, not `$set: { field: undefined }`. Mongoose 6 removed
      // `omitUndefined`, so an undefined value is stripped from the update
      // rather than clearing the field — these three kept their previous
      // values. That silently orphaned every re-subscription: the webhook
      // handler skips storing a new Paymob id when one is already present, so
      // renewals, suspensions and cancellations all went on addressing the
      // shop's *previous* Paymob subscription, and cancelling posted the stale
      // id while the live recurring mandate kept running.
      $unset: {
        paymobSubscriptionId: "",
        paymobTransactionId: "",
        cancelledAt: "",
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return { subscription, effectiveTrialDays };
}

// Cancel subscription
export async function cancelSubscription(userId: string) {
  const subscription = await Subscriptions.findOne({
    userId,
    status: {
      $in: [
        SubscriptionStatus.ACTIVE,
        SubscriptionStatus.TRIALING,
        SubscriptionStatus.PENDING,
        SubscriptionStatus.EXPIRED,
      ],
    },
  });

  if (!subscription) {
    throw new Errors.NotFoundError(errMsg.NO_ACTIVE_SUBSCRIPTION);
  }

  // Only trial/pending subscriptions never billed through Paymob have no
  // paymobSubscriptionId — nothing to cancel remotely in that case.
  if (subscription.paymobSubscriptionId) {
    await cancelPaymobSubscription(subscription.paymobSubscriptionId);
  }

  subscription.status = SubscriptionStatus.CANCELLED;
  subscription.cancelledAt = new Date();
  await subscription.save();

  return subscription.toObject();
}

/**
 * The user's subscription, if it currently entitles them to service.
 *
 * This was the third place that answered "is this subscription active" with a
 * different rule: it admitted PENDING (not yet paid for) and ignored the
 * cancellation grace period entirely, so it disagreed with both the access
 * gate and the re-subscribe guard. It now shares their definition.
 *
 * Changing it is safe: it has no callers outside tests. That is also why it
 * was worth fixing rather than leaving — the next person to wire it into a
 * dashboard would have inherited a fourth answer.
 */
export async function getUserActiveSubscription(
  userId: string,
): Promise<ISubscription | null> {
  const subscription = await Subscriptions.findOne({
    userId,
    ...entitledToServiceFilter(),
  })
    .populate(
      "plan",
      "planGroup title description price currency frequency features",
    )
    .populate("shop", "name email phoneNumber");

  return subscription;
}

// Get all subscriptions (admin)
export async function getAllSubscriptions(filters: {
  page?: number;
  limit?: number;
  userId?: string;
  status?: SubscriptionStatus;
  planId?: string;
  search?: string;
}): Promise<{ subscriptions: ISubscription[]; totalCount: number }> {
  const { page = 1, limit = 10, userId, status, planId, search = "" } = filters;
  const skip = (page - 1) * limit;

  // Build filter object.
  //
  // The two id filters must be cast by hand. This filter is handed to
  // `$match` inside an aggregation, and unlike `find()`, aggregate does no
  // schema casting — a string compared against a stored ObjectId simply never
  // matches. Both filters therefore returned an empty list with
  // `totalCount: 0` for every input, correct ones included, which reads to an
  // admin as "this customer has no subscriptions" rather than as a failure.
  // `status` is a string in the schema too, so it was unaffected, which is
  // why the endpoint looked like it worked.
  const filter: FilterQuery<ISubscription> = {};
  if (userId) filter.userId = toObjectId(userId, "userId");
  if (status) filter.status = status;
  if (planId) filter.plan = toObjectId(planId, "planId");

  // Search by user email, shop name, or plan title
  const aggregatePipeline: PipelineStage[] = [
    { $match: filter },
    // Join user, shop, and plan for search
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },
    {
      $lookup: {
        from: "shops",
        localField: "shop",
        foreignField: "_id",
        as: "shop",
      },
    },
    {
      $lookup: {
        from: "plans",
        localField: "plan",
        foreignField: "_id",
        as: "plan",
      },
    },
    { $unwind: "$user" },
    { $unwind: "$shop" },
    { $unwind: "$plan" },
  ];
  if (search) {
    aggregatePipeline.push({
      $match: {
        $or: [
          { "user.email": { $regex: search, $options: "i" } },
          { "shop.name": { $regex: search, $options: "i" } },
          { "plan.title": { $regex: search, $options: "i" } },
        ],
      },
    });
  }
  aggregatePipeline.push(
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
  );
  const subscriptions = await Subscriptions.aggregate(aggregatePipeline);
  // For total count
  const countPipeline = aggregatePipeline.slice(
    0,
    aggregatePipeline.findIndex((stage) => "$sort" in stage),
  );
  countPipeline.push({ $count: "totalCount" });
  const countResult = await Subscriptions.aggregate(countPipeline);
  const totalCount = countResult[0]?.totalCount || 0;
  return {
    subscriptions,
    totalCount,
  };
}

// Get subscription by ID (admin)
export async function getSubscriptionById(
  subscriptionId: string,
): Promise<ISubscription | null> {
  const subscription = await Subscriptions.findById(subscriptionId)
    .populate("userId", "firstName lastName email phoneNumber")
    .populate("shop", "name email phoneNumber address")
    .populate(
      "plan",
      "planGroup title description price currency frequency features",
    );

  return subscription;
}
