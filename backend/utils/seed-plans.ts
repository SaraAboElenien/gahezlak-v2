/**
 * Seeds subscription plans, creating the matching plan on Paymob first.
 *
 * Why this exists as a script rather than "just use the admin UI": creating a
 * plan requires an admin account AND a working MOTO integration, and until
 * 2026-08-05 no MOTO id existed, so no plan could be created by any route at
 * all. The database was unblocked at the time by hand-inserting a placeholder
 * `Plan` with `paymobPlanId: 0` — which can never actually bill anyone, since
 * Paymob has no such plan. This script replaces that fiction with real,
 * Paymob-backed plans.
 *
 * Idempotent in the way that matters: a local plan that already has a real
 * (non-zero) `paymobPlanId` is left completely alone, so re-running never
 * creates duplicate plans on Paymob's side. A plan sitting at `paymobPlanId: 0`
 * is *repaired in place* — same `_id`, so existing subscriptions pointing at it
 * keep working rather than being orphaned.
 *
 * Run: npm run seed:plans:dev
 */
import mongoose from "mongoose";
import { Plans } from "../models/Plan";
import { connectDB } from "../config/db";
import { createSubscriptionPlan } from "./paymob";

interface PlanSeed {
  planGroup: string;
  frequency: "monthly" | "yearly";
  currency: "EGP";
  price: number;
  description: string;
  features: string[];
  trialPeriodDays: number;
}

const SEEDS: PlanSeed[] = [
  {
    planGroup: "Starter",
    frequency: "monthly",
    currency: "EGP",
    price: 299,
    description: "For a single restaurant getting started with digital menus.",
    features: [
      "1 shop",
      "Unlimited menu items",
      "QR code ordering",
      "Up to 3 staff accounts",
      "Basic sales reports",
    ],
    trialPeriodDays: 14,
  },
  {
    planGroup: "Starter",
    frequency: "yearly",
    currency: "EGP",
    price: 2990,
    description:
      "For a single restaurant getting started with digital menus. Two months free versus monthly.",
    features: [
      "1 shop",
      "Unlimited menu items",
      "QR code ordering",
      "Up to 3 staff accounts",
      "Basic sales reports",
      "2 months free",
    ],
    trialPeriodDays: 14,
  },
  {
    planGroup: "Pro",
    frequency: "monthly",
    currency: "EGP",
    price: 799,
    description:
      "For growing restaurants that need staff management and deeper analytics.",
    features: [
      "1 shop",
      "Unlimited menu items",
      "QR code ordering",
      "Unlimited staff accounts",
      "Advanced analytics and reports",
      "Priority support",
    ],
    trialPeriodDays: 14,
  },
  {
    planGroup: "Pro",
    frequency: "yearly",
    currency: "EGP",
    price: 7990,
    description:
      "For growing restaurants that need staff management and deeper analytics. Two months free versus monthly.",
    features: [
      "1 shop",
      "Unlimited menu items",
      "QR code ordering",
      "Unlimited staff accounts",
      "Advanced analytics and reports",
      "Priority support",
      "2 months free",
    ],
    trialPeriodDays: 14,
  },
];

async function seedPlans() {
  await connectDB();

  let created = 0;
  let repaired = 0;
  let skipped = 0;

  for (const seed of SEEDS) {
    const title = `${seed.planGroup} (${seed.frequency} - ${seed.currency})`;
    const existing = await Plans.findOne({
      planGroup: seed.planGroup,
      frequency: seed.frequency,
    });

    if (existing && existing.paymobPlanId > 0) {
      console.log(
        `skip     ${title} — already backed by Paymob plan ${existing.paymobPlanId}`,
      );
      skipped++;
      continue;
    }

    // Only reached when the plan is missing entirely, or exists as a
    // placeholder that Paymob knows nothing about.
    const paymobPlan = await createSubscriptionPlan({
      planName: title,
      frequency: seed.frequency,
      amountInCents: seed.price * 100,
      isActive: true,
    });

    if (existing) {
      existing.set({
        title,
        description: seed.description,
        currency: seed.currency,
        price: seed.price,
        features: seed.features,
        trialPeriodDays: seed.trialPeriodDays,
        isActive: true,
        paymobPlanId: paymobPlan.id,
      });
      await existing.save();
      console.log(
        `repaired ${title} — placeholder now backed by Paymob plan ${paymobPlan.id} (_id unchanged: ${existing._id})`,
      );
      repaired++;
    } else {
      const doc = await Plans.create({
        planGroup: seed.planGroup,
        title,
        description: seed.description,
        currency: seed.currency,
        frequency: seed.frequency,
        features: seed.features,
        price: seed.price,
        trialPeriodDays: seed.trialPeriodDays,
        isActive: true,
        paymobPlanId: paymobPlan.id,
      });
      console.log(
        `created  ${title} — Paymob plan ${paymobPlan.id}, local _id ${doc._id}`,
      );
      created++;
    }
  }

  console.log(
    `\nDone. ${created} created, ${repaired} repaired, ${skipped} left untouched.`,
  );
  await mongoose.connection.close();
}

seedPlans().catch(async (err) => {
  console.error("Error seeding plans:", err);
  await mongoose.connection.close();
  process.exit(1);
});
