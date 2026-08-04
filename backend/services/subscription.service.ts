import {
  ISubscription,
  SubscriptionStatus,
  Subscriptions,
} from "../models/Subscription";
import { Errors } from "../errors";
import { errMsg } from "../common/err-messages";
import { IPlan } from "../models/Plan";
import { cancelPaymobSubscription } from "../utils/paymob";
import { FilterQuery, PipelineStage } from "mongoose";

export async function createOrUpdatePendingSubscription({
  shopId,
  userId,
  plan,
}: {
  shopId: string;
  userId: string;
  plan: IPlan;
}) {
  // 1. Check for a currently valid subscription (active, trialing, or cancelled-in-grace-period)
  const existingValidSub = await Subscriptions.findOne({
    shop: shopId,
    $or: [
      {
        status: {
          $in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
        },
      },
      {
        status: SubscriptionStatus.CANCELLED,
        currentPeriodEnd: { $gt: new Date() },
      },
    ],
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
        isTrialUsed: isEligibleForTrial,

        paymobSubscriptionId: undefined,
        paymobTransactionId: undefined,
        cancelledAt: undefined,
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

// Get user's active subscription
export async function getUserActiveSubscription(
  userId: string,
): Promise<ISubscription | null> {
  const subscription = await Subscriptions.findOne({
    userId,
    status: {
      $in: [
        SubscriptionStatus.ACTIVE,
        SubscriptionStatus.TRIALING,
        SubscriptionStatus.PENDING,
      ],
    },
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

  // Build filter object
  const filter: FilterQuery<ISubscription> = {};
  if (userId) filter.userId = userId;
  if (status) filter.status = status;
  if (planId) filter.plan = planId;

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
