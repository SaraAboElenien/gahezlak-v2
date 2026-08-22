import { FilterQuery, PipelineStage } from "mongoose";
import { ISubscription, Subscriptions } from "../models/Subscription";
import { Orders } from "../models/Order";
import { Errors } from "../errors";

/**
 * Turns the two raw query-string dates these endpoints receive into a window,
 * or into nothing at all when the caller did not ask for one.
 *
 * `routes/admin.routes.ts` mounts all three analytics endpoints with **no
 * validator**, so both arguments are unvalidated user input and may be absent.
 * Both failure modes are worth naming, because neither announces itself:
 *
 * - Absent: `new Date(undefined)` is an Invalid Date. Inside an aggregation
 *   `$match` that matches *nothing* — no error, just a permanently empty
 *   report. That is exactly how the top-restaurants ranking came to be blank
 *   for every caller that omitted the range.
 * - Unparseable: a `find()` surfaces it as a Mongoose CastError (a 500 naming
 *   an internal schema path), while an aggregation swallows it into the same
 *   silent-empty result. A 400 is the honest answer to both.
 */
function parseDateWindow(
  startDate: string,
  endDate: string,
): { start: Date; end: Date } | null {
  if (!startDate || !endDate) return null;

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Errors.BadRequestError({
      en: "startDate and endDate must be valid dates",
      ar: "يجب أن يكون تاريخ البداية وتاريخ النهاية تاريخين صالحين",
    });
  }

  return { start, end };
}

// Total Revenue from Subscriptions
export async function getTotalPlatformRevenue(
  startDate: string,
  endDate: string,
) {
  const query: FilterQuery<ISubscription> = { status: "active" };

  const dateWindow = parseDateWindow(startDate, endDate);
  if (dateWindow) {
    query.currentPeriodStart = { $gte: dateWindow.start };
    query.currentPeriodEnd = { $lte: dateWindow.end };
  }

  const subscriptions = await Subscriptions.find(query).populate("plan");

  const totalRevenue = subscriptions.reduce((sum, sub) => {
    // `plan` is an ObjectId unless populate() resolved it — narrow rather
    // than assert, so an unpopulated doc scores 0 instead of NaN.
    const plan = sub.plan;
    const planPrice = plan && "price" in plan ? plan.price : 0;
    return sum + planPrice;
  }, 0);

  return totalRevenue;
}

// Revenue Growth Rate
export async function getRevenueGrowthRate(
  start1: string,
  end1: string,
  start2: string,
  end2: string,
) {
  const revenue1 = await getTotalPlatformRevenue(start1, end1);
  const revenue2 = await getTotalPlatformRevenue(start2, end2);

  if (revenue1 === 0) return revenue2 > 0 ? 100 : 0;

  const growthRate = ((revenue2 - revenue1) / revenue1) * 100;
  return growthRate;
}

// Top Performing Restaurants by Order Revenue
export async function getTopPerformingRestaurants(
  limit = 5,
  startDate: string,
  endDate: string,
) {
  const dateWindow = parseDateWindow(startDate, endDate);

  const match: PipelineStage.Match["$match"] = { orderStatus: "Delivered" };
  if (dateWindow) {
    match.createdAt = { $gte: dateWindow.start, $lte: dateWindow.end };
  }

  const topShops = await Orders.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$shopId",
        totalShopRevenue: { $sum: "$totalAmount" },
      },
    },
    { $sort: { totalShopRevenue: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "shops",
        localField: "_id",
        foreignField: "_id",
        as: "shop",
      },
    },
    { $unwind: "$shop" },
    {
      $project: {
        _id: 0,
        shopId: "$_id",
        shopName: "$shop.name",
        totalShopRevenue: 1,
      },
    },
  ]);

  return topShops;
}
