import { FilterQuery, PipelineStage } from "mongoose";
import { ISubscription, Subscriptions } from "../models/Subscription";
import { Orders } from "../models/Order";
import { parsePlatformDateWindow } from "../utils/report-date-window";

/**
 * Turns the two raw query-string dates these endpoints receive into a
 * half-open [start, end) window in PLATFORM_TIMEZONE, or into nothing at
 * all when the caller did not ask for one. See
 * `utils/report-date-window.ts` for the full reasoning — timezone,
 * exclusive end, DST — this is a thin re-export so call sites below read
 * naturally.
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
const parseDateWindow = parsePlatformDateWindow;

// Total Revenue from Subscriptions
export async function getTotalPlatformRevenue(
  startDate: string,
  endDate: string,
) {
  const query: FilterQuery<ISubscription> = { status: "active" };

  const dateWindow = parseDateWindow(startDate, endDate);
  if (dateWindow) {
    // Containment semantics (start within window AND end within window) are
    // a separate, already-known bug (see TECH_DEBT.md / the service test
    // file) and are deliberately left exactly as-is here — only how the
    // window's own boundaries are computed has changed. `end` is now the
    // exclusive next-local-midnight instant from `parsePlatformDateWindow`,
    // so the comparison is `$lt` rather than the old inclusive `$lte`.
    query.currentPeriodStart = { $gte: dateWindow.start };
    query.currentPeriodEnd = { $lt: dateWindow.end };
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
    match.createdAt = { $gte: dateWindow.start, $lt: dateWindow.end };
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
