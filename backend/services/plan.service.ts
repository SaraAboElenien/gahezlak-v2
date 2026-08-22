import { errMsg } from "../common/err-messages";
import { Errors } from "../errors";
import { IPlan, Plans } from "../models/Plan";

export async function createPlan(
  planData: Omit<IPlan, "_id" | "createdAt" | "updatedAt">,
) {
  const plan = await Plans.create(planData);
  return plan;
}

export async function getPlanById(planId: string) {
  const plan = await Plans.findById(planId).lean();
  if (!plan) {
    throw new Errors.NotFoundError(errMsg.PLAN_NOT_FOUND);
  }
  return plan;
}

export async function getAllPlans() {
  const plans = await Plans.find().lean();
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
