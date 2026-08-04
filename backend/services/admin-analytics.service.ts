import { FilterQuery } from "mongoose";
import { ISubscription, Subscriptions } from "../models/Subscription";
import { Orders } from "../models/Order";

// Total Revenue from Subscriptions
export async function getTotalPlatformRevenue(
  startDate: string,
  endDate: string,
) {
  const query: FilterQuery<ISubscription> = { status: "active" };

  if (startDate && endDate) {
    query.currentPeriodStart = { $gte: new Date(startDate) };
    query.currentPeriodEnd = { $lte: new Date(endDate) };
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
  const topShops = await Orders.aggregate([
    {
      $match: {
        orderStatus: "Delivered",
        createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) },
      },
    },
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
