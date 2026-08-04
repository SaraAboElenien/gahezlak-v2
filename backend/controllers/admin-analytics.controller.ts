import { Request, Response } from "express";
import {
  getTotalPlatformRevenue,
  getRevenueGrowthRate,
  getTopPerformingRestaurants,
} from "../services/admin-analytics.service";

export const getTotalPlatformRevenueController = async (
  req: Request,
  res: Response,
) => {
  const { startDate, endDate } = req.query;
  const total = await getTotalPlatformRevenue(
    startDate as string,
    endDate as string,
  );

  res.status(200).json({
    message: "Total revenue retrieved",
    data: {
      totalRevenue: total,
    },
  });
};

export const getRevenueGrowthController = async (
  req: Request,
  res: Response,
) => {
  const { start1, end1, start2, end2 } = req.query;

  const growth = await getRevenueGrowthRate(
    start1 as string,
    end1 as string,
    start2 as string,
    end2 as string,
  );

  res.status(200).json({
    message: "Revenue growth rate retrieved",
    data: {
      percentageChange: Number(growth.toFixed(2)),
    },
  });
};

export const getTopPerformingRestaurantsController = async (
  req: Request,
  res: Response,
) => {
  const { limit, startDate, endDate } = req.query;

  const top = await getTopPerformingRestaurants(
    Number(limit || 5),
    startDate as string,
    endDate as string,
  );

  res.status(200).json({
    message: "Top restaurants retrieved",
    data: top,
  });
};
