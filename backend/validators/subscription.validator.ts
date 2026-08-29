import { param } from "express-validator";
import { validate } from "../middlewares/validators";

/**
 * `GET /subscriptions/:subscriptionId` had no validation of any kind.
 *
 * `getSubscriptionById` casts the id itself as well — the two guards answer
 * different callers, not the same one twice — but this is the one that gives an
 * admin a 422 naming the field rather than a generic error from further down.
 */
export const subscriptionIdParamValidator = [
  param("subscriptionId").isMongoId().withMessage("Invalid subscription ID"),
  validate,
];
