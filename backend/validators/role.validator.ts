import { body, param } from "express-validator";
import { validate } from "../middlewares/validators";
import { Role } from "../models/Role";

/**
 * Shared by every `/roles/:id` route. Admin-only, so lower severity than the
 * public plan route — but a malformed id still became a CastError and therefore
 * a 500 rather than a 422, and the update and delete paths now read the role
 * before acting, so they hit it too.
 */
export const roleIdParamValidator = [
  param("id").isMongoId().withMessage("Invalid role ID"),
  validate,
];

export const createRoleValidator = [
  body("name")
    .exists()
    .withMessage("name is required")
    .isIn(Object.values(Role))
    .withMessage("invalid role name"),
  // body("permissions")
  //   .optional()
  //   .isArray()
  //   .withMessage("permissions must be an array"),
  // body("permissions.*").isString().withMessage("permission must be a string"), disabled for now
  validate,
];

export const updateRoleValidator = [
  body("name")
    .optional()
    .isIn(Object.values(Role))
    .withMessage("invalid role name"),
  // body("permissions")
  //   .optional()
  //   .isArray()
  //   .withMessage("permissions must be an array"),
  // body("permissions.*").isString().withMessage("permission must be a string"),
  validate,
];
