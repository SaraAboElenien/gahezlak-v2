import { body, param, query } from "express-validator";
import { validate } from "../middlewares/validators";

export const validateRequestEmailChange = [
  body("newEmail").isEmail().withMessage("Invalid new email address"),
  validate,
];

export const validateConfirmEmailChange = [
  body("code")
    .isString()
    .notEmpty()
    .withMessage("Confirmation code is required"),
  validate,
];

export const validateUpdateProfile = [
  body("firstName")
    .optional()
    .isString()
    .isLength({ min: 2, max: 50 })
    .withMessage("First name must be between 2 and 50 characters"),
  body("lastName")
    .optional()
    .isString()
    .isLength({ min: 2, max: 50 })
    .withMessage("Last name must be between 2 and 50 characters"),
  body("phoneNumber")
    .optional()
    .isString()
    .isLength({ min: 10, max: 15 })
    .withMessage("Phone number must be between 10 and 15 characters"),
  validate,
];

export const validateGetAllUsers = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),
  query("search")
    .optional()
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage("Search term must be between 1 and 100 characters"),
  validate,
];

export const validateUserId = [
  param("id").isMongoId().withMessage("Invalid user ID format"),
  validate,
];

export const validateChangePassword = [
  body("oldPassword")
    .isString()
    .notEmpty()
    .withMessage("Old password is required"),
  body("newPassword")
    .isString()
    .isLength({ min: 8 })
    .withMessage("New password must be at least 8 characters long")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      "New password must contain at least one lowercase letter, one uppercase letter, and one number",
    ),
  validate,
];
