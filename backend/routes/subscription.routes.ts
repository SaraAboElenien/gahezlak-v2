import { Router } from "express";
import * as subscriptionController from "../controllers/subscription.controller";
import { protect, isAllowed } from "../middlewares/auth";
import { Role } from "../models/Role";
import { subscriptionIdParamValidator } from "../validators/subscription.validator";

const router = Router();

// Create subscription (existing)
router.post("/", protect, subscriptionController.createSubscriptionHandler);

// Get all subscriptions (admin only)
router.get(
  "/",
  protect,
  isAllowed([Role.ADMIN]),
  subscriptionController.getAllSubscriptionsHandler,
);

// Get subscription by ID (admin only)
router.get(
  "/:subscriptionId",
  protect,
  isAllowed([Role.ADMIN]),
  subscriptionIdParamValidator,
  subscriptionController.getSubscriptionByIdHandler,
);

export default router;
