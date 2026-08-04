import { RequestHandler } from "express";
import {
  CanceledOrderRate,
  OrderCountsByDate,
  SalesComparison,
  BestAndWorstSellers,
  totalRevenue,
} from "../services/shop-analysis.service";
import { requireUser } from "../utils/current-user";

export const CanceledOrderRateController: RequestHandler = async (req, res) => {
  const { shopId } = requireUser(req);
  const canceledOrders = await CanceledOrderRate(shopId);
  res
    .status(200)
    .json({ message: "Cancellation rate retrieved", data: canceledOrders });
};

export const OrderCountsByDateController: RequestHandler<
  unknown,
  unknown,
  unknown,
  // `orderCountsByDateValidator` runs first and rejects anything that isn't
  // one of these three buckets, so `period` is guaranteed present and valid.
  { period: "daily" | "monthly" | "yearly" }
> = async (req, res) => {
  const { period } = req.query;
  const { shopId } = requireUser(req);
  const ordersPerDate = await OrderCountsByDate(shopId, period);
  res
    .status(200)
    .json({ message: "Orders count retrieved", data: ordersPerDate });
};

export const SalesComparisonController: RequestHandler = async (req, res) => {
  const { start1, end1, start2, end2 } = req.query;
  const { shopId } = requireUser(req);
  const salesComparison = await SalesComparison(
    shopId,
    new Date(start1 as string),
    new Date(end1 as string),
    new Date(start2 as string),
    new Date(end2 as string),
  );
  res
    .status(200)
    .json({ message: "Sales trend retrieved", data: salesComparison });
};

export const BestAndWorstSellersController: RequestHandler = async (
  req,
  res,
) => {
  const { limit, startDate, endDate } = req.query;
  const { shopId } = requireUser(req);

  const BestAndWorstOrders = await BestAndWorstSellers(
    shopId,
    parseInt(limit as string) || 5,
    startDate as string,
    endDate as string,
  );

  res
    .status(200)
    .json({ message: "Sellers data retrieved", data: BestAndWorstOrders });
};

export const TotalRevenueController: RequestHandler = async (req, res) => {
  const { shopId } = requireUser(req);
  const totalRevenueForShop = await totalRevenue(shopId);
  res
    .status(200)
    .json({ message: "Total revenue retrieved", data: totalRevenueForShop });
};
