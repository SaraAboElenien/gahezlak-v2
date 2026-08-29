import mongoose, { FilterQuery, PipelineStage } from "mongoose";
import { IOrder, Orders, OrderStatus } from "../models/Order";
import { Errors } from "../errors";
import {
  PLATFORM_TIMEZONE,
  parsePlatformDateWindow,
  platformDayWindowFromDates,
} from "../utils/report-date-window";

/**
 * What counts as a sale, in one place.
 *
 * `totalRevenue` and `SalesComparison` are rendered side by side on the
 * owner's analytics tab and are computed over the same collection, but they
 * used to disagree: the revenue figure excluded `Cancelled` and `Pending`
 * while the trend chart applied no status filter at all, so the chart was
 * inflated by every order the kitchen refused and every order nobody has paid
 * for yet. Two numbers derived from one collection that do not reconcile is
 * worse than either being wrong alone, because it leaves the owner no way to
 * tell which to believe.
 *
 * `totalRevenue`'s definition is the one kept. `Cancelled` is uncontroversial;
 * `Pending` is excluded because it is money that exists but has not settled —
 * a customer who abandoned the Paymob iframe leaves a Pending order behind
 * forever (see `handleOrderPaid`, which is what promotes one to `Confirmed`).
 *
 * Exported as a function rather than a shared object literal so no caller can
 * mutate the filter another caller is about to spread.
 */
const NON_SALE_ORDER_STATUSES = [
  OrderStatus.Cancelled,
  OrderStatus.Pending,
] as const;

function saleOrderStatusFilter(): FilterQuery<IOrder> {
  return { orderStatus: { $nin: [...NON_SALE_ORDER_STATUSES] } };
}

export async function CanceledOrderRate(shopId: string) {
  const totalOrders = await Orders.countDocuments({ shopId });
  const canceledOrders = await Orders.countDocuments({
    shopId,
    orderStatus: OrderStatus.Cancelled,
  });

  const rate = totalOrders > 0 ? (canceledOrders / totalOrders) * 100 : 0;

  return {
    totalOrders,
    canceledOrders,
    cancellationRate: Number(rate.toFixed(2)),
  }; // convert string to number
}

export async function OrderCountsByDate(
  shopId: string,
  period: "daily" | "monthly" | "yearly",
) {
  // Every date operator here is given PLATFORM_TIMEZONE explicitly. Left off,
  // MongoDB buckets in UTC — and Cairo is UTC+2/+3, so every order taken
  // between local midnight and 02:00/03:00 was filed under the previous day.
  // For a restaurant that is not a rare edge, it is the tail of the dinner
  // service, and it also made "today" on this chart disagree with "today" in
  // the orders list for the first hours of every local morning. Same
  // platform-wide-zone decision as the report windows below; see
  // utils/report-date-window.ts.
  const tz = { timezone: PLATFORM_TIMEZONE };
  const groupId = {
    daily: {
      year: { $year: { date: "$createdAt", ...tz } },
      month: { $month: { date: "$createdAt", ...tz } },
      day: { $dayOfMonth: { date: "$createdAt", ...tz } },
    },
    monthly: {
      year: { $year: { date: "$createdAt", ...tz } },
      month: { $month: { date: "$createdAt", ...tz } },
    },
    yearly: { year: { $year: { date: "$createdAt", ...tz } } },
  }[period];

  const ordersPerDate = await Orders.aggregate([
    { $match: { shopId: new mongoose.Types.ObjectId(shopId) } },
    { $group: { _id: groupId, count: { $sum: 1 } } },
    { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
  ]);

  return ordersPerDate;
}

export async function SalesComparison(
  shopId: string,
  start1: Date,
  end1: Date,
  start2: Date,
  end2: Date,
) {
  const sumSales = async (start: Date, end: Date) => {
    // `start`/`end` arrive here as Dates the controller already built from
    // "YYYY-MM-DD" query strings via `new Date(...)`, which parses a
    // date-only string as UTC midnight — so their UTC calendar date is
    // exactly the calendar day that was typed. Re-derive a proper
    // PLATFORM_TIMEZONE half-open window from that day rather than using
    // the raw UTC-midnight instants directly, which is what used to cut the
    // last day of the range off at its very start (00:00 UTC).
    const window = platformDayWindowFromDates(start, end);

    const orders = await Orders.aggregate([
      {
        $match: {
          shopId: new mongoose.Types.ObjectId(shopId),
          createdAt: { $gte: window.start, $lt: window.end },
          // Same definition of "a sale" as totalRevenue — see
          // saleOrderStatusFilter above.
          ...saleOrderStatusFilter(),
        },
      },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]);

    return orders[0]?.total || 0;
  };

  const total1 = await sumSales(start1, end1);
  const total2 = await sumSales(start2, end2);

  let change: number;

  if (total1 === 0 && total2 === 0) {
    change = 0;
  } else if (total1 === 0 && total2 > 0) {
    change = 100;
  } else {
    change = ((total2 - total1) / total1) * 100;
  }

  return { total1, total2, percentageChange: Number(change.toFixed(2)) };
}

export async function BestAndWorstSellers(
  shopId: string,
  limit: number = 5,
  startDate?: string,
  endDate?: string,
) {
  // Build match query
  const matchQuery: FilterQuery<IOrder> = {
    shopId: new mongoose.Types.ObjectId(shopId),
  };

  if (startDate && endDate) {
    // Half-open, PLATFORM_TIMEZONE-aware window — see
    // utils/report-date-window.ts. `startDate`/`endDate` are the raw
    // "YYYY-MM-DD" query strings, so this goes through the string-based
    // parser rather than the Date-based one `SalesComparison` above needs.
    const window = parsePlatformDateWindow(startDate, endDate);
    if (window) {
      matchQuery.createdAt = { $gte: window.start, $lt: window.end };
    }
  }

  // Helper function to create aggregation pipeline.
  //
  // The secondary sort on `menuItemId` is deliberately reversed between the two
  // orders, so the two pipelines are exact mirrors of each other rather than
  // both falling back to whatever order Mongo happens to return for a tie. Two
  // dishes that sold the same amount would otherwise be free to appear at the
  // head of *both* lists.
  const createAggregationPipeline = (sortOrder: 1 | -1): PipelineStage[] => [
    { $match: matchQuery },
    { $unwind: "$orderItems" },
    {
      $group: {
        _id: "$orderItems.menuItem",
        total: { $sum: "$orderItems.quantity" },
      },
    },
    {
      $lookup: {
        from: "menu_items",
        localField: "_id",
        foreignField: "_id",
        as: "menuItem",
      },
    },
    // `preserveNullAndEmptyArrays` matters: without it this $unwind is an inner
    // join, so a dish that sold well and was later deleted from the menu
    // vanished from the ranking entirely — the report silently under-reported
    // exactly the history a report about the past exists to show. The row is
    // now kept and labelled instead, and `menuItemId` is taken from the group
    // key (which is always present) rather than from the joined document.
    { $unwind: { path: "$menuItem", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        menuItemId: "$_id",
        name: {
          $ifNull: ["$menuItem.name", { en: "Deleted item", ar: "صنف محذوف" }],
        },
        total: 1,
      },
    },
    { $sort: { total: sortOrder, menuItemId: sortOrder === -1 ? 1 : -1 } },
    { $limit: limit },
  ];

  try {
    // Execute both aggregations in parallel for better performance
    const [bestSellers, worstSellers] = await Promise.all([
      Orders.aggregate(createAggregationPipeline(-1)), // Best sellers (descending)
      Orders.aggregate(createAggregationPipeline(1)), // Worst sellers (ascending)
    ]);

    // The two lists are one ranking read from both ends, so a shop with fewer
    // distinct sold dishes than `limit` used to see its single best seller
    // presented as a worst seller too — on a new shop's dashboard, which is
    // precisely the first time anyone looks at the feature.
    //
    // "Best" wins the tie-break: anything already shown as a best seller is
    // dropped from the worst list, which suppresses the worst panel entirely
    // until there are enough dishes for the comparison to say anything. Note
    // this changes nothing at all once a shop has at least `2 * limit` distinct
    // sold dishes — the ample case, where the two ends cannot meet.
    const bestIds = new Set(bestSellers.map((row) => String(row.menuItemId)));

    return {
      bestSellers: bestSellers || [],
      worstSellers: (worstSellers || []).filter(
        (row) => !bestIds.has(String(row.menuItemId)),
      ),
    };
  } catch {
    throw new Errors.UnprocessableError({
      en: "Failed to retrieve best and worst sellers",
      ar: "فشل في استرجاع أفضل وأسوأ  المنتجات المباعة",
    });
  }
}

export async function totalRevenue(shopId: string) {
  const total = await Orders.aggregate([
    {
      $match: {
        shopId: new mongoose.Types.ObjectId(shopId),
        ...saleOrderStatusFilter(),
      },
    },
    { $group: { _id: null, total: { $sum: "$totalAmount" } } },
  ]);
  return total[0]?.total || 0;
}
