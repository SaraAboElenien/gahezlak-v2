import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { Subscriptions, SubscriptionStatus } from "../models/Subscription";
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

  if (subscription.status === SubscriptionStatus.EXPIRED) {
    throw new Errors.NotAllowedError(errMsg.SUBSCRIPTION_EXPIRED);
  }

  if (
    ![SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING].includes(
      subscription.status,
    )
  ) {
    throw new Errors.NotAllowedError(errMsg.NO_ACTIVE_SUBSCRIPTION);
  }
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
