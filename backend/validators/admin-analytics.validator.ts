import { query } from "express-validator";
import { validate } from "../middlewares/validators";

/**
 * Query validators for the three admin analytics endpoints.
 *
 * `routes/admin.routes.ts` mounted all three with no validator at all, unlike
 * every shop-analysis route, so query parameters reached the service exactly
 * as typed. The services defend themselves now (`parseDateWindow` throws a 400
 * on an unparseable date rather than silently matching nothing), so this is
 * not closing a live 500 — it is putting the type and format checking back at
 * the boundary, which is the pattern everywhere else in this codebase and the
 * thing that stops the *next* unguarded parameter going unnoticed.
 *
 * Every date is `.optional()`, because omitting a window legitimately means
 * "no date filter" to all three services — that is a distinct case from an
 * invalid window, and conflating them is how `new Date(undefined)` once turned
 * an omitted parameter into an Invalid Date that a `$match` silently matched
 * nothing against.
 *
 * A half-specified window IS rejected, though. Sending only a `startDate` is
 * currently ignored outright, so the caller gets an all-time figure while
 * believing they asked for a range — a confidently wrong number, which is the
 * failure mode these analytics endpoints keep producing. Same rule
 * `bestAndWorstSellersValidator` already enforces on the shop side.
 */

/** Both halves of a window must be present, or neither. */
const bothOrNeither = (startKey: string, endKey: string) =>
  query(startKey).custom((_value, { req }) => {
    const start = req.query?.[startKey];
    const end = req.query?.[endKey];
    if ((start && !end) || (!start && end)) {
      throw new Error(
        `Both ${startKey} and ${endKey} must be provided together or omitted together`,
      );
    }
    return true;
  });

const optionalIsoDate = (key: string) =>
  query(key)
    .optional()
    .isISO8601()
    .withMessage(`${key} must be a valid ISO 8601 date`);

export const totalPlatformRevenueValidator = [
  optionalIsoDate("startDate"),
  optionalIsoDate("endDate"),
  bothOrNeither("startDate", "endDate"),
  validate,
];

export const revenueGrowthValidator = [
  optionalIsoDate("start1"),
  optionalIsoDate("end1"),
  optionalIsoDate("start2"),
  optionalIsoDate("end2"),
  bothOrNeither("start1", "end1"),
  bothOrNeither("start2", "end2"),
  validate,
];

export const topPerformingRestaurantsValidator = [
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be an integer between 1 and 100"),
  optionalIsoDate("startDate"),
  optionalIsoDate("endDate"),
  bothOrNeither("startDate", "endDate"),
  validate,
];
