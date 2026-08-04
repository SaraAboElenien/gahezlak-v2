import { body, param } from "express-validator";
import { validate } from "../middlewares/validators";

export const createAdminReportValidation = [
  body("shopName").isString().withMessage("Shop name must be a string"),

  body("senderFirstName")
    .optional()
    .isString()
    .withMessage("Sender first name must be a string"),

  body("senderLastName")
    .optional()
    .isString()
    .withMessage("Sender last name must be a string"),

  body("message")
    .notEmpty()
    .withMessage("Message is required")
    .isString()
    .withMessage("Message must be a string")
    .isLength({ min: 10, max: 1000 })
    .withMessage("Message must be between 10 and 1000 characters"),

  body("phoneNumber").isInt().withMessage("Phone number must be an integer"),

  validate,
];

export const createShopReportValidation = [
  param("shopName").isString().withMessage("Shop name must be a string"),

  body("senderFirstName")
    .isString()
    .withMessage("Sender first name must be a string"),

  body("senderLastName")
    .isString()
    .withMessage("Sender last name must be a string"),

  body("message")
    .notEmpty()
    .withMessage("Message is required")
    .isString()
    .withMessage("Message must be a string")
    .isLength({ min: 10, max: 1000 })
    .withMessage("Message must be between 10 and 1000 characters"),

  body("orderNumber").isInt().withMessage("Order number must be an integer"),

  body("phoneNumber").isInt().withMessage("Phone number must be an integer"),

  validate,
];
