import { PipelineStage } from "mongoose";
import { Orders } from "../models/Order";
import {
  PaymentTransactions,
  PLATFORM_REVENUE_KINDS,
} from "../models/PaymentTransaction";
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

/**
 * Total platform revenue: the sum of subscription charges that SETTLED inside
 * the window.
 *
 * REWRITTEN 2026-08-29 (ADR-018). This used to sum `plan.price` over every
 * subscription whose billing period was *contained* by the window, which was
 * wrong three separate ways and confidently so — it reported a number rather
 * than failing:
 *
 *   1. Containment, not overlap, so every still-running subscription was
 *      excluded. A monthly plan could only ever be counted in a window at
 *      least a month wide that happened to bracket it exactly.
 *   2. It read the plan's price *now*. Editing a plan silently rewrote every
 *      historical figure that plan had ever contributed to.
 *   3. It counted subscriptions, not payments — so a trial that never
 *      converted, or a renewal Paymob failed to take, still scored full price.
 *
 * All three dissolve once there is a record of money to aggregate over, which
 * is what `PaymentTransactions` is. Note the window is now applied to
 * `settledAt`, a fact about a transaction that never changes, rather than to
 * subscription period boundaries, which move.
 *
 * ORDER PAYMENTS ARE EXCLUDED — see `PLATFORM_REVENUE_KINDS`. That money
 * belongs to the restaurant; counting it here would overstate the platform by
 * roughly the entire GMV.
 */
export async function getTotalPlatformRevenue(
  startDate: string,
  endDate: string,
) {
  const match: PipelineStage.Match["$match"] = {
    kind: { $in: [...PLATFORM_REVENUE_KINDS] },
  };

  const dateWindow = parseDateWindow(startDate, endDate);
  if (dateWindow) {
    // Half-open [start, end): `end` is the exclusive next-local-midnight
    // instant from `parsePlatformDateWindow`, which is why this is `$lt` and
    // not `$lte`. An inclusive end is how this project previously dropped the
    // whole final day of every report.
    match.settledAt = { $gte: dateWindow.start, $lt: dateWindow.end };
  }

  const [result] = await PaymentTransactions.aggregate<{ total: number }>([
    { $match: match },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);

  // No matching transactions is a legitimate answer of zero, not an error —
  // and it is the honest answer today, since no subscription charge has ever
  // settled on this platform.
  return result?.total ?? 0;
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
    // `preserveNullAndEmptyArrays` is load-bearing. `$unwind` over an empty
    // array DROPS the document, so without it this stage is silently an inner
    // join: a shop that has since been deleted takes its revenue out of the
    // ranking entirely, and the admin sees a total that does not reconcile
    // with the orders actually in the database. Failing to name a deleted shop
    // is acceptable; failing to count its money is not.
    { $unwind: { path: "$shop", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        shopId: "$_id",
        // A deleted shop still has revenue and still needs a label.
        shopName: { $ifNull: ["$shop.name", null] },
        totalShopRevenue: 1,
      },
    },
  ]);

  return topShops;
}
