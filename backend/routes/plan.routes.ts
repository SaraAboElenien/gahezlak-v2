import { Router } from "express";
import * as controllers from "../controllers/plans.controller";
import { protect, isAllowed } from "../middlewares/auth";
import { Role } from "../models/Role";
import {
  createPlanValidator,
  updatePlanValidator,
  activateOrDeactivatePlanValidator,
} from "../validators/plan.validator";

const planRoutes = Router();

planRoutes.post(
  "/",
  protect,
  isAllowed([Role.ADMIN]),
  createPlanValidator,
  controllers.createPlanHandler,
);
planRoutes.get("/", controllers.getPlansHandler);
planRoutes.get("/:id", controllers.getPlanById);
planRoutes.put(
  "/:id",
  protect,
  isAllowed([Role.ADMIN]),
  updatePlanValidator,
  controllers.updatePlanHandler,
);
planRoutes.patch(
  "/:id/activate",
  protect,
  isAllowed([Role.ADMIN]),
  activateOrDeactivatePlanValidator,
  controllers.activateOrDeactivatePlanHandler,
);

export default planRoutes;
