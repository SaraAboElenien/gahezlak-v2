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

export async function updatePlan(
  planId: string,
  planData: Partial<
    Omit<IPlan, "_id" | "createdAt" | "updatedAt" | "isActive">
  >,
) {
  const plan = await Plans.findByIdAndUpdate(planId, planData, {
    new: true,
  }).lean();

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
