import express from "express";
import {
  getTotalPlatformRevenueController,
  getRevenueGrowthController,
  getTopPerformingRestaurantsController,
} from "../controllers/admin-analytics.controller";
import { protect, isAllowed } from "../middlewares/auth";
import { Role } from "../models/Role";

const router = express.Router();

// Protect all routes and allow only admin
router.use(protect, isAllowed([Role.ADMIN]));

// admin analysis routes

router.get("/analytics/total-revenue", getTotalPlatformRevenueController);
router.get("/analytics/revenue-growth", getRevenueGrowthController);
router.get("/analytics/top-restaurants", getTopPerformingRestaurantsController);

export default router;
