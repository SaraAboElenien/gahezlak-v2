import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import {
  Subscriptions,
  SubscriptionStatus,
  isEntitledToService,
} from "../models/Subscription";
import { Errors } from "../errors";
import { errMsg } from "../common/err-messages";
import { getUserShop } from "../services/shop.service";

// Shared by the authenticated-route middleware below and by
// createOrderHandler (public checkout, keyed by shopName instead of an
// authenticated user's shop) — see order.controller.ts.
export async function assertShopHasActiveSubscription(
  shopId: mongoose.Types.ObjectId | string,
) {
  const subscription = await Subscriptions.findOne({ shop: shopId }).lean();
  if (!subscription) {
    throw new Errors.NotAllowedError(errMsg.NO_SUBSCRIPTION_FOUND);
  }

  // One shared rule rather than a second copy of it here — this gate admitting
  // only ACTIVE/TRIALING while the re-subscribe guard honoured the cancellation
  // grace period is what locked paid-up shops out of their own dashboards.
  // See isEntitledToService in models/Subscription.ts.
  if (isEntitledToService(subscription)) {
    return;
  }

  // Past due is worth its own message: the shop fixes it by paying, which is
  // not true of the others. That now has to cover a subscription whose stored
  // status still reads ACTIVE, TRIALING or CANCELLED but whose period has run
  // out. Before the clock was consulted for ACTIVE, a lapsed ACTIVE row could
  // not reach this line at all; it now can, and "No active subscription found
  // for user" would be both inaccurate (there is one, and it says active) and
  // unactionable. Statuses that were never paid for are deliberately excluded,
  // so a PENDING checkout that was abandoned is not told it "expired".
  const lapsable: SubscriptionStatus[] = [
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.TRIALING,
    SubscriptionStatus.CANCELLED,
  ];
  const hasLapsed =
    subscription.status === SubscriptionStatus.EXPIRED ||
    (lapsable.includes(subscription.status) &&
      subscription.currentPeriodEnd <= new Date());

  if (hasLapsed) {
    throw new Errors.NotAllowedError(errMsg.SUBSCRIPTION_EXPIRED);
  }

  throw new Errors.NotAllowedError(errMsg.NO_ACTIVE_SUBSCRIPTION);
}

export const checkActiveSubscrtion = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const userId = req.user?.userId;
  if (!userId) {
    return next(new Errors.UnauthenticatedError(errMsg.USER_NOT_AUTHENTICATED));
  }

  const shop = await getUserShop(userId);
  await assertShopHasActiveSubscription(shop._id);

  next();
};
