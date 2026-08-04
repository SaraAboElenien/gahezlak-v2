import { body } from "express-validator";
import { validate } from "../middlewares/validators";

export const createPlanValidator = [
  body("planGroup")
    .exists()
    .withMessage("planGroup is required")
    // .isIn(["Pro", "Starter"]) // TODO: uncomment this when the plan group is ready
    .withMessage("planGroup must be Pro or Starter"),
  body("description").exists().withMessage("description is required"),
  body("frequency")
    .exists()
    .withMessage("frequency is required")
    .isIn(["monthly", "yearly"])
    .withMessage("frequency must be monthly or yearly"),
  body("currency")
    .exists()
    .withMessage("currency is required")
    .isIn(["EGP", "USD"])
    .withMessage("currency must be EGP or USD"),
  body("price")
    .exists()
    .withMessage("price is required")
    .isInt({ min: 1 })
    .withMessage("price must be integer"),
  body("features")
    .exists()
    .withMessage("features is required")
    .isArray({ min: 1 })
    .withMessage("features must be array"),
  body("features.*").isString().withMessage("feature must be string"),
  body("trialPeriodDays")
    .exists()
    .withMessage("trialPeriodDays is required")
    .isInt({})
    .withMessage("trialPeriodDays must be integer"),
  validate,
];

export const updatePlanValidator = [
  body("planGroup")
    .optional()
    .isIn(["Pro", "Starter"])
    .withMessage("planGroup must be Pro or Starter"),
  body("description")
    .optional()
    .isString()
    .withMessage("description must be string"),
  body("frequency")
    .optional()
    .isIn(["monthly", "yearly"])
    .withMessage("frequency must be monthly or yearly"),
  body("currency")
    .optional()
    .isIn(["EGP", "USD"])
    .withMessage("currency must be EGP or USD"),
  body("price")
    .optional()
    .isInt({ min: 1 })
    .withMessage("price must be integer"),
  body("features")
    .optional()
    .isArray({ min: 1 })
    .withMessage("features must be array"),
  body("features.*")
    .optional()
    .isString()
    .withMessage("feature must be string"),
  body("trialPeriodDays")
    .optional()
    .isInt({ min: 1 })
    .withMessage("trialPeriodDays must be integer"),
  validate,
];

export const activateOrDeactivatePlanValidator = [
  body("isActive")
    .exists()
    .withMessage("isActive is required")
    .isBoolean()
    .withMessage("isActive must be boolean"),
  validate,
];
