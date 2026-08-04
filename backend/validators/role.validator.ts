import { body } from "express-validator";
import { validate } from "../middlewares/validators";
import { Role } from "../models/Role";

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
