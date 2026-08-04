import { body, param, query } from "express-validator";
import { validate } from "../middlewares/validators";

export const shopIdValidator = [
  param("shopId").isMongoId().withMessage("Invalid shopId"),
  validate,
];

export const creatShopValidator = [
  body("name")
    .isString()
    .withMessage("Shop name must be a string")
    .trim()
    .isLength({ min: 3 })
    .withMessage("Shop name must be at least 3 characters long"),
  body("type").isString().withMessage("Shop type must be a string"),
  body("address").isObject().withMessage("Shop address must be an object"),
  body("address.country")
    .isString()
    .withMessage("Shop address country must be a string"),
  body("address.city")
    .isString()
    .withMessage("Shop address city must be a string"),
  body("address.street")
    .isString()
    .withMessage("Shop address street must be a string"),
  body("phoneNumber")
    .isMobilePhone("ar-EG")
    .withMessage("Shop phone number must be a valid Egyptian mobile number"),
  body("email").isString().withMessage("Shop email must be a string"),
  validate,
];

export const updateShopValidator = [
  param("shopId").isMongoId().withMessage("Shop ID must be a valid MongoDB ID"),
  body("name")
    .optional()
    .isString()
    .withMessage("Shop name must be a string")
    .trim()
    .isLength({ min: 3 })
    .withMessage("Shop name must be at least 3 characters long"),
  body("address")
    .optional()
    .isObject()
    .withMessage("Shop address must be an object"),
  body("address.country")
    .optional()
    .isString()
    .withMessage("Shop address country must be a string"),
  body("address.city")
    .optional()
    .isString()
    .withMessage("Shop address city must be a string"),
  body("address.street")
    .optional()
    .isString()
    .withMessage("Shop address street must be a string"),
  body("phoneNumber")
    .optional()
    .isMobilePhone("ar-EG")
    .withMessage("Shop phone number must be a valid Egyptian mobile number"),
  body("email")
    .optional()
    .isString()
    .withMessage("Shop email must be a string"),
  validate,
];

export const validateRegenerateQRCode = [
  body("width")
    .optional()
    .isInt({ min: 100, max: 1000 })
    .withMessage("Width must be between 100 and 1000"),
  body("margin")
    .optional()
    .isInt({ min: 0, max: 10 })
    .withMessage("Margin must be between 0 and 10"),
  body("errorCorrectionLevel")
    .optional()
    .isIn(["L", "M", "Q", "H"])
    .withMessage("Error correction level must be L, M, Q, or H"),
  validate,
];

export const shopNameParamValidator = [
  param("shopName").isString().withMessage("Shop name must be a string").trim(),
  validate,
];

export const addMemberValidator = [
  param("shopId").isMongoId().withMessage("Shop ID must be a valid MongoDB ID"),
  body("firstName")
    .isString()
    .withMessage("First name must be a string")
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("First name must be between 2 and 50 characters"),
  body("lastName")
    .isString()
    .withMessage("Last name must be a string")
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Last name must be between 2 and 50 characters"),
  body("email")
    .isEmail()
    .withMessage("Email must be a valid email address")
    .normalizeEmail(),
  body("password")
    .isString()
    .withMessage("Password must be a string")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long"),
  body("phoneNumber")
    .optional()
    .isMobilePhone("ar-EG")
    .withMessage("Phone number must be a valid Egyptian mobile number"),
  body("roleId").isMongoId().withMessage("Role ID must be a valid MongoDB ID"),
  validate,
];

export const removeMemberValidator = [
  param("shopId").isMongoId().withMessage("Shop ID must be a valid MongoDB ID"),
  param("userId").isMongoId().withMessage("User ID must be a valid MongoDB ID"),
  validate,
];

export const updateMemberRoleValidator = [
  param("shopId").isMongoId().withMessage("Shop ID must be a valid MongoDB ID"),
  param("userId").isMongoId().withMessage("User ID must be a valid MongoDB ID"),
  body("roleId").isMongoId().withMessage("Role ID must be a valid MongoDB ID"),
  validate,
];

// Shop Analysis Query Validators
export const orderCountsByDateValidator = [
  query("period")
    .notEmpty()
    .withMessage("Period is required")
    .isIn(["daily", "monthly", "yearly"])
    .withMessage("Period must be one of: daily, monthly, yearly"),
  validate,
];

export const salesComparisonValidator = [
  query("start1")
    .notEmpty()
    .withMessage("start1 is required")
    .isISO8601()
    .withMessage("start1 must be a valid ISO 8601 date"),
  query("end1")
    .notEmpty()
    .withMessage("end1 is required")
    .isISO8601()
    .withMessage("end1 must be a valid ISO 8601 date"),
  query("start2")
    .notEmpty()
    .withMessage("start2 is required")
    .isISO8601()
    .withMessage("start2 must be a valid ISO 8601 date"),
  query("end2")
    .notEmpty()
    .withMessage("end2 is required")
    .isISO8601()
    .withMessage("end2 must be a valid ISO 8601 date"),
  validate,
];

export const bestAndWorstSellersValidator = [
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be an integer between 1 and 100"),
  query("startDate")
    .optional()
    .isISO8601()
    .withMessage("startDate must be a valid ISO 8601 date")
    .custom((value, { req }) => {
      const startDate = req.query?.startDate;
      const endDate = req.query?.endDate;
      if ((startDate && !endDate) || (!startDate && endDate)) {
        throw new Error(
          "Both startDate and endDate must be provided together or omitted together",
        );
      }
      return true;
    }),
  query("endDate")
    .optional()
    .isISO8601()
    .withMessage("endDate must be a valid ISO 8601 date"),
  validate,
];
