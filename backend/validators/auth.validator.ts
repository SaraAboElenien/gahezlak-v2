import { body, cookie } from "express-validator";
import { validate } from "../middlewares/validators";
import { REFRESH_TOKEN_COOKIE } from "../config/cookies";

export const validateRegister = [
  body("firstName").isString().notEmpty().withMessage("First name is required"),
  body("lastName").isString().notEmpty().withMessage("Last name is required"),
  body("email").isEmail().withMessage("Invalid email address"),
  body("password")
    .isString()
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long"),
  body("phoneNumber")
    .isMobilePhone("ar-EG")
    .withMessage("Phone number must be a valid Egyptian phone number"),
  validate,
];

export const validateVerifyCode = [
  body("email").isEmail().withMessage("Invalid email address"),
  body("code")
    .isString()
    .notEmpty()
    .withMessage("Verification code is required"),
  // Defence in depth alongside the same check in verifyCode: this endpoint
  // mints a session, so it must never accept a password_reset OTP. Previously
  // any non-empty string got through.
  body("reason")
    .isString()
    .isIn(["account_verification"])
    .withMessage("Reason must be account_verification"),
  validate,
];

export const validateResendVerificationCode = [
  body("email").isEmail().withMessage("Invalid email address"),
  validate,
];

export const validateLogin = [
  body("email").isEmail().withMessage("Invalid email address"),
  body("password").isString().notEmpty().withMessage("Password is required"),
  validate,
];

export const validateForgotPassword = [
  body("email").isEmail().withMessage("Invalid email address"),
  validate,
];

export const validateResetPassword = [
  body("email").isEmail().withMessage("Invalid email address"),
  body("code")
    .isString()
    .notEmpty()
    .withMessage("Verification code is required"),
  body("newPassword")
    .isString()
    .isLength({ min: 8 })
    .withMessage("New password must be at least 8 characters long"),
  validate,
];

// The refresh token is read from the httpOnly cookie, never from the request
// body — see config/cookies.ts for why.
export const validateRefreshToken = [
  cookie(REFRESH_TOKEN_COOKIE)
    .isString()
    .notEmpty()
    .withMessage("Refresh token is required"),
  validate,
];
