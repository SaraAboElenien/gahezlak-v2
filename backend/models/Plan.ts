import mongoose, { Schema, Types } from "mongoose";
import { collectionsName } from "../common/collections-name";

export interface IPlan {
  _id: Types.ObjectId;
  planGroup: string; // e.g. "Pro", "Starter" — groups monthly/yearly together
  title: string;
  description: string;
  frequency: "monthly" | "yearly";
  currency: "EGP" | "USD";
  price: number;
  paymobPlanId: number;
  features: string[];
  trialPeriodDays: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const planSchema = new Schema<IPlan>(
  {
    planGroup: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    frequency: { type: String, required: true },
    currency: { type: String, required: true },
    price: { type: Number, required: true },
    paymobPlanId: { type: Number, required: true },
    features: { type: [String], required: true },
    trialPeriodDays: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
  },

  {
    timestamps: true,
    collection: collectionsName.PLANS,
  },
);

/**
 * One plan per (group, frequency) — the rule the pricing page depends on, now
 * enforced where it cannot be raced.
 *
 * `createPlanHandler` states the rule as a read (`getPlanSByGroup`) followed by
 * a write, with nothing between them: two concurrent creates both see no
 * monthly Starter and both insert one, and any caller reaching `createPlan`
 * directly skips the check outright. The consequence is not cosmetic — the
 * public pricing page renders whatever `getAllPlans` returns, so a duplicate
 * appears as two identical-looking monthly plans at possibly different prices,
 * and a customer can be billed against whichever one they happened to click.
 *
 * `currency` is deliberately not part of the key: the rule the controller
 * enforces, and the one the pricing page assumes, is one monthly and one yearly
 * per group — a second EGP-vs-USD monthly Starter would be the same duplicate.
 *
 * Safe to add: production holds four plans (Starter/Pro × monthly/yearly), all
 * distinct on this key, so the build that runs on the next boot has nothing to
 * reject.
 */
planSchema.index({ planGroup: 1, frequency: 1 }, { unique: true });

export const Plans = mongoose.model<IPlan>(collectionsName.PLANS, planSchema);
