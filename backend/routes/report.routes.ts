import { Router } from "express";
import {
  createShopReportController,
  createAdminReportController,
  getAllAdminReportsController,
  getAllShopReportsController,
} from "../controllers/report.controller";
import { protect, isAllowed } from "../middlewares/auth";
import { Role } from "../models/Role";
import { isShopMember } from "../middlewares/shop-member-check.middleware";
import {
  createAdminReportValidation,
  createShopReportValidation,
} from "../validators/report.validator";

const router = Router();

// Anyone (even without auth) can submit report to send shop
router.post(
  "/:shopName/shop",
  createShopReportValidation,
  createShopReportController,
);
// Anyone (even without auth) can submit report to send admin
router.post("/admin", createAdminReportValidation, createAdminReportController);

// Admin dashboard
router.get(
  "/admin",
  protect,
  isAllowed([Role.ADMIN]),
  getAllAdminReportsController,
);

// Shop dashboard
router.get(
  "/shop",
  protect,
  isAllowed([Role.SHOP_OWNER, Role.SHOP_MANAGER]),
  isShopMember,
  getAllShopReportsController,
);

export default router;
