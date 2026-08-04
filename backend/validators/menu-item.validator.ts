import { body, param } from "express-validator";
import { validate } from "../middlewares/validators";

export const validateCreateMenuItem = [
  body("name.en").isString().withMessage("English name is required"),
  body("name.ar").isString().withMessage("Arabic name is required"),

  body("description.en")
    .optional()
    .isString()
    .withMessage("English description must be a string"),
  body("description.ar")
    .optional()
    .isString()
    .withMessage("Arabic description must be a string"),

  body("price")
    .isFloat({ min: 0 })
    .withMessage("Price must be a non-negative number"),
  body("categoryId").isMongoId().withMessage("Invalid categoryId"),

  body("imgUrl").optional().isString(),
  body("discountPercentage")
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage("Discount percentage must be between 0 and 100"),

  body("options").optional().isArray(),
  body("options.*.name.en")
    .isString()
    .withMessage("English option name is required"),
  body("options.*.name.ar")
    .isString()
    .withMessage("Arabic option name is required"),
  body("options.*.type")
    .isIn(["single", "multiple"])
    .withMessage("Invalid option type"),
  body("options.*.required")
    .isBoolean()
    .withMessage("Required must be a boolean"),
  body("options.*.choices").isArray().withMessage("Choices must be an array"),
  body("options.*.choices.*.name.en")
    .isString()
    .withMessage("English choice name is required"),
  body("options.*.choices.*.name.ar")
    .isString()
    .withMessage("Arabic choice name is required"),
  body("options.*.choices.*.price")
    .isFloat({ min: 0 })
    .withMessage("Choice price must be non-negative"),

  body("isAvailable").optional().isBoolean(),

  validate,
];

export const validateUpdateMenuItem = [
  param("itemId").isMongoId().withMessage("Invalid itemId"),
  body("name.en").optional().isString(),
  body("name.ar").optional().isString(),
  body("description.en").optional().isString(),
  body("description.ar").optional().isString(),
  body("price").optional().isFloat({ min: 0 }),
  body("categoryId").optional().isMongoId().withMessage("Invalid categoryId"),
  body("imgUrl").optional().isString(),
  body("discountPercentage")
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage("Discount percentage must be between 0 and 100"),
  body("options").optional().isArray(),
  body("options.*.name.en").optional().isString(),
  body("options.*.name.ar").optional().isString(),
  body("options.*.type").optional().isIn(["single", "multiple"]),
  body("options.*.required").optional().isBoolean(),
  body("options.*.choices").optional().isArray(),
  body("options.*.choices.*.name.en").optional().isString(),
  body("options.*.choices.*.name.ar").optional().isString(),
  body("options.*.choices.*.price").optional().isFloat({ min: 0 }),
  body("isAvailable").optional().isBoolean(),
  validate,
];

export const validateToggleAvailability = [
  param("itemId").isMongoId().withMessage("Invalid itemId"),
  body("isAvailable").isBoolean().withMessage("isAvailable must be a boolean"),
  validate,
];

export const validateGetOrDeleteItemById = [
  param("itemId").isMongoId().withMessage("Invalid itemId"),
  validate,
];
