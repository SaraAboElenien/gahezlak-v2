import { FilterQuery } from "mongoose";
import { errMsg } from "../common/err-messages";
import { Errors } from "../errors";
import { IPlan, Plans } from "../models/Plan";

/**
 * Is this the driver's duplicate-key error?
 *
 * Mongoose surfaces it as a `MongoServerError` with `code: 11000` rather than
 * as anything typed, so the check is on the code. Narrowed by hand because
 * importing the driver's error class here would tie the service to a
 * dependency it otherwise never names.
 */
function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: number }).code === 11000
  );
}

export async function createPlan(
  planData: Omit<IPlan, "_id" | "createdAt" | "updatedAt">,
) {
  try {
    const plan = await Plans.create(planData);
    return plan;
  } catch (err) {
    // The unique (planGroup, frequency) index is what actually enforces "one
    // monthly and one yearly per group" — `createPlanHandler`'s check-then-act
    // cannot, since two concurrent creates both pass it. Left untranslated the
    // collision reaches the global handler as an untyped driver error and
    // becomes a 500, which reads to an admin as "the server is broken" rather
    // than "that plan already exists".
    if (isDuplicateKeyError(err)) {
      throw new Errors.BadRequestError(errMsg.PLAN_ALREADY_EXISTS);
    }
    throw err;
  }
}

export async function getPlanById(planId: string) {
  const plan = await Plans.findById(planId).lean();
  if (!plan) {
    throw new Errors.NotFoundError(errMsg.PLAN_NOT_FOUND);
  }
  return plan;
}

/**
 * Every plan on sale — and, for an administrator, optionally the retired ones.
 *
 * `GET /plans` is unauthenticated and served this list verbatim, so before the
 * filter below "deactivate a plan" meant only "hide it in one of the two places
 * the frontend asks": `plansApiService.getActivePlans()` filters client-side,
 * `getPlans()` does not, and neither is a control. A retired plan was still
 * quotable, still linkable and still subscribable.
 *
 * The filter defaults to the safe direction because the only caller today is
 * that public route. `includeInactive` exists for the admin listing — there is
 * no such endpoint yet, and building one needs a handler in
 * `plans.controller.ts`; until then an administrator can still reach a
 * deactivated plan by id (`getPlanById` is deliberately unfiltered, so
 * `PATCH /plans/:id/activate` can always put one back on sale).
 */
export async function getAllPlans({ includeInactive = false } = {}) {
  const filter: FilterQuery<IPlan> = includeInactive ? {} : { isActive: true };
  const plans = await Plans.find(filter).lean();
  return plans;
}

/**
 * Fields `updatePlan` will write, and the complete list of them.
 *
 * `updatePlanHandler` hands `req.body` straight through, and express-validator
 * checks the fields it names without stripping the ones it does not — so
 * whatever the client sends arrives here. The signature above already excluded
 * `_id`, `createdAt`, `updatedAt` and `isActive`, but that was a claim about
 * types, and types are gone at runtime. Three things were writable that should
 * not be:
 *
 * - `paymobPlanId` is the link to the live recurring mandate at Paymob. Every
 *   subscription built against this plan quotes it in its intention, so
 *   overwriting it silently moves future billing onto a different Paymob plan
 *   — a different amount, possibly a different frequency — with nothing in the
 *   app showing that anything changed.
 * - `isActive` has its own endpoint, validator and service function. Setting
 *   it through a general update takes a plan off sale through a route that was
 *   never meant to.
 * - `_id` made findByIdAndUpdate throw a driver-level "would modify the
 *   immutable field '_id'" error, which is not a CustomError and so surfaced
 *   as a 500.
 *
 * `title` is on the list even though `updatePlanValidator` does not name it:
 * the create path *derives* it from planGroup/frequency/currency, so once any
 * of those change this is the only way to correct it, and it is a display
 * string with no billing or security meaning. Leaving it off would repeat the
 * mistake made once before in this codebase — an allowlist built purely from a
 * validator, which then stripped legitimate fields from every update while
 * still returning 200. Both directions are pinned by tests: that the dangerous
 * fields are refused, and that an ordinary edit of every field above persists.
 */
const UPDATABLE_PLAN_FIELDS = [
  "planGroup",
  "title",
  "description",
  "frequency",
  "currency",
  "price",
  "features",
  "trialPeriodDays",
] as const satisfies readonly (keyof IPlan)[];

function pickUpdatablePlanFields(planData: Partial<IPlan>): Partial<IPlan> {
  const updates: Partial<IPlan> = {};
  for (const field of UPDATABLE_PLAN_FIELDS) {
    const value = planData[field];
    if (value !== undefined) {
      // TypeScript cannot correlate the key with its value type while `field`
      // ranges over a union of keys, so it widens the target to `never`. The
      // assignment is sound — the same `field` indexes both objects.
      (updates as Record<string, unknown>)[field] = value;
    }
  }
  return updates;
}

export async function updatePlan(
  planId: string,
  planData: Partial<
    Omit<IPlan, "_id" | "createdAt" | "updatedAt" | "isActive">
  >,
) {
  const plan = await Plans.findByIdAndUpdate(
    planId,
    pickUpdatablePlanFields(planData),
    {
      new: true,
    },
  ).lean();

  if (!plan) {
    throw new Errors.NotFoundError(errMsg.PLAN_NOT_FOUND);
  }
  return plan;
}

export async function getPlanSByGroup(planGroup: string) {
  const plans = await Plans.find({ planGroup }).lean();
  return plans;
}

export async function activateOrDeactivatePlan(
  planId: string,
  isActive: boolean,
) {
  const plan = await Plans.findByIdAndUpdate(
    planId,
    { isActive },
    {
      new: true,
    },
  ).lean();
  if (!plan) {
    throw new Errors.NotFoundError(errMsg.PLAN_NOT_FOUND);
  }
  return plan;
}
