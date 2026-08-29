import express from "express";
import {
  getTotalPlatformRevenueController,
  getRevenueGrowthController,
  getTopPerformingRestaurantsController,
} from "../controllers/admin-analytics.controller";
import { protect, isAllowed } from "../middlewares/auth";
import { Role } from "../models/Role";
import {
  totalPlatformRevenueValidator,
  revenueGrowthValidator,
  topPerformingRestaurantsValidator,
} from "../validators/admin-analytics.validator";

const router = express.Router();

// Protect all routes and allow only admin
router.use(protect, isAllowed([Role.ADMIN]));

// admin analysis routes

router.get(
  "/analytics/total-revenue",
  totalPlatformRevenueValidator,
  getTotalPlatformRevenueController,
);
router.get(
  "/analytics/revenue-growth",
  revenueGrowthValidator,
  getRevenueGrowthController,
);
router.get(
  "/analytics/top-restaurants",
  topPerformingRestaurantsValidator,
  getTopPerformingRestaurantsController,
);

export default router;
