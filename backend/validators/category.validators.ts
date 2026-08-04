import { body, param } from "express-validator";
import { validate } from "../middlewares/validators";

// Validate shopId param
export const categoryParamValidators = [
  param("shopId").isMongoId().withMessage("Invalid shopId"),
  validate,
];

// Validate categoryId param
export const categoryIdValidator = [
  param("categoryId").isMongoId().withMessage("Invalid categoryId"),
  validate,
];

// Create category validator
export const createCategoryValidator = [
  body("name.en")
    .isString()
    .withMessage("Category name in English is required"),

  body("name.ar").isString().withMessage("Category name in Arabic is required"),

  body("description.en")
    .optional()
    .isString()
    .withMessage("Description in English must be a string"),

  body("description.ar")
    .optional()
    .isString()
    .withMessage("Description in Arabic must be a string"),

  validate,
];

// Update category validator
export const updateCategoryValidator = [
  param("categoryId").isMongoId().withMessage("Invalid categoryId"),
  body("name.en")
    .optional()
    .isString()
    .withMessage("Category name in english must be a string"),

  body("name.ar")
    .optional()
    .isString()
    .withMessage("Category name in arabic must be a string"),

  body("description.en")
    .optional()
    .isString()
    .withMessage("Description in english must be a string"),

  body("description.ar")
    .optional()
    .isString()
    .withMessage("Description in arabic must be a string"),

  validate,
];

// Validate updating a menu item inside category
export const updateItemInCategoryValidator = [
  param("itemId").isMongoId().withMessage("Invalid itemId"),

  body("name").optional().isString().withMessage("Name must be a string"),
  body("description")
    .optional()
    .isString()
    .withMessage("Description must be a string"),
  body("price")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Price must be a non-negative number"),
  body("imgUrl").optional().isString(),
  body("discount")
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage("Discount must be between 0 and 100"),

  body("options").optional().isArray().withMessage("Options must be an array"),
  body("options.*.group")
    .optional()
    .isString()
    .withMessage("Option group is required"),
  body("options.*.type")
    .optional()
    .isIn(["single", "multiple"])
    .withMessage("Invalid option type"),
  body("options.*.required")
    .optional()
    .isBoolean()
    .withMessage("Required must be a boolean"),
  body("options.*.choices")
    .optional()
    .isArray()
    .withMessage("Choices must be an array"),
  body("options.*.choices.*.label")
    .optional()
    .isString()
    .withMessage("Choice label is required"),
  body("options.*.choices.*.price")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Choice price must be non-negative"),

  body("isAvailable")
    .optional()
    .isBoolean()
    .withMessage("isAvailable must be boolean"),

  validate,
];
