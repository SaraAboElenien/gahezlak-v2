import { Router } from "express";
import * as controllers from "../controllers/role.controller";
import { isAllowed, protect } from "../middlewares/auth";
import {
  createRoleValidator,
  updateRoleValidator,
  roleIdParamValidator,
} from "../validators/role.validator";
import { Role } from "../models/Role";

const roleRoutes = Router();

roleRoutes.post(
  "/",
  protect,
  isAllowed([Role.ADMIN]),
  createRoleValidator,
  controllers.createRoleHandler,
);
roleRoutes.get(
  "/",
  protect,
  isAllowed([Role.ADMIN, Role.SHOP_OWNER]), //shop owner can only get roles available for their shop
  controllers.getRolesHandler,
);
roleRoutes.get(
  "/:id",
  protect,
  isAllowed([Role.ADMIN]),
  roleIdParamValidator,
  controllers.getRoleByIdHandler,
);
roleRoutes.put(
  "/:id",
  protect,
  isAllowed([Role.ADMIN]),
  roleIdParamValidator,
  updateRoleValidator,
  controllers.updateRoleHandler,
);
roleRoutes.delete(
  "/:id",
  protect,
  isAllowed([Role.ADMIN]),
  roleIdParamValidator,
  controllers.deleteRoleHandler,
);

export default roleRoutes;
