import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import {
  connectTestDB,
  disconnectTestDB,
  clearTestDB,
} from "../db-test-helper";
import { Plans } from "../../models/Plan";
import type { IPlan } from "../../models/Plan";
import { errMsg } from "../../common/err-messages";

/**
 * Service-level coverage for the plan service, which had none.
 *
 * A `Plan` document is small but it sits on the money path twice over. Its
 * `price`/`frequency` are what a restaurant is quoted, its `trialPeriodDays`
 * is what `createOrUpdatePendingSubscription` turns into `effectiveTrialDays`
 * — the number that decides whether the first Paymob transaction is an
 * auto-voided verification or a real charge — and its `paymobPlanId` is the
 * link to the live recurring mandate at Paymob. Nothing downstream re-derives
 * any of those; whatever is on the document is the decision.
 *
 * Two of the five functions are also reachable without authentication:
 * `GET /plans` and `GET /plans/:id` have no `protect` in front of them
 * (routes/plan.routes.ts), so `getAllPlans` and `getPlanById` are public
 * responses.
 *
 * Deliberately NOT mocked: Mongo. The behaviours that actually needed pinning
 * here — what `findByIdAndUpdate` does with an `_id` in the payload, and what
 * `find()` does with an undefined selector — are properties of the driver, not
 * of this file's control flow, and a mocked model cannot tell you about them.
 * Paymob is not a boundary of this service: the controller talks to Paymob and
 * hands the resulting `paymobPlanId` down.
 */

const planService = () => import("../../services/plan.service");

type CapturedError = Error & { statusCode?: number; name: string };

/**
 * Awaits a call that is expected to reject and hands back the error itself, so
 * a test can inspect it. Fails loudly if the call resolves.
 */
async function captureError(promise: Promise<unknown>): Promise<CapturedError> {
  try {
    await promise;
  } catch (err) {
    return err as CapturedError;
  }
  throw new Error("expected the call to reject, but it resolved");
}

let titleSeq = 0;

function planInput(overrides: Partial<IPlan> = {}) {
  return {
    planGroup: "Starter",
    title: `Starter monthly ${++titleSeq}`,
    description: "Everything a small restaurant needs",
    frequency: "monthly",
    currency: "EGP",
    price: 299,
    paymobPlanId: 11405,
    features: ["QR menu", "Orders"],
    trialPeriodDays: 14,
    isActive: true,
    ...overrides,
  } as Omit<IPlan, "_id" | "createdAt" | "updatedAt">;
}

const seedPlan = (overrides: Partial<IPlan> = {}) =>
  Plans.create(planInput(overrides));

beforeAll(async () => {
  await connectTestDB();
  // Not optional. Mongoose builds indexes in the background, so without this
  // the duplicate-plan test races the build of the unique (planGroup,
  // frequency) index and passes or fails on scheduling. This project has
  // already shipped a test that was green for weeks purely by winning that
  // race (tests/models/subscription-entitlement.test.ts, 2026-08-24);
  // `init()` makes the constraint genuinely in force before the first insert.
  await Plans.init();
});

afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearTestDB();
});

describe("createPlan", () => {
  it("persists every field it is handed", async () => {
    const { createPlan } = await planService();

    const plan = await createPlan(
      planInput({
        planGroup: "Pro",
        price: 899,
        frequency: "yearly",
        currency: "USD",
        paymobPlanId: 22222,
        trialPeriodDays: 30,
        features: ["QR menu", "Analytics", "Staff"],
      }),
    );

    const stored = await Plans.findById(plan._id).lean();
    expect(stored).toMatchObject({
      planGroup: "Pro",
      price: 899,
      frequency: "yearly",
      currency: "USD",
      paymobPlanId: 22222,
      trialPeriodDays: 30,
      features: ["QR menu", "Analytics", "Staff"],
      isActive: true,
    });
  });

  it("refuses a plan with no Paymob id", async () => {
    // A plan without `paymobPlanId` cannot be subscribed to — the intention
    // call quotes it — so this required-field check is the difference between
    // failing at creation and failing at the first customer's checkout.
    const { createPlan } = await planService();
    const input = planInput();
    delete (input as Partial<IPlan>).paymobPlanId;

    const err = await captureError(createPlan(input));

    expect(err.name).toBe("ValidationError");
  });

  it("regression: refuses a second plan for the same group and frequency", async () => {
    // The "one monthly and one yearly per group" rule used to live entirely in
    // `createPlanHandler`, which reads the existing plans and then writes — a
    // check-then-act with nothing behind it. Two concurrent creates both passed
    // the check, and any caller reaching the service directly skipped it
    // outright. It is not cosmetic: the pricing page renders whatever
    // `getAllPlans` returns, so a duplicate shows up as two identical-looking
    // monthly plans at possibly different prices, and a customer is billed
    // against whichever one they clicked.
    const { createPlan } = await planService();
    await createPlan(planInput({ planGroup: "Starter", frequency: "monthly" }));

    const err = await captureError(
      createPlan(planInput({ planGroup: "Starter", frequency: "monthly" })),
    );

    // Translated, not raw: an untranslated E11000 is not a CustomError and
    // reaches the admin as a 500 — "the server is broken" rather than "that
    // plan already exists".
    expect(err.message).toBe(errMsg.PLAN_ALREADY_EXISTS.en);
    expect(err.statusCode).toBe(400);
    expect(await Plans.countDocuments({ planGroup: "Starter" })).toBe(1);
  });

  it("still allows the other frequency, and the same frequency in another group", async () => {
    // The other direction of the constraint, and the shape production actually
    // holds: Starter and Pro, each monthly and yearly. A key that was too broad
    // would take the live pricing table down rather than protect it.
    const { createPlan } = await planService();
    await createPlan(planInput({ planGroup: "Starter", frequency: "monthly" }));

    await expect(
      createPlan(planInput({ planGroup: "Starter", frequency: "yearly" })),
    ).resolves.toBeDefined();
    await expect(
      createPlan(planInput({ planGroup: "Pro", frequency: "monthly" })),
    ).resolves.toBeDefined();
    expect(await Plans.countDocuments()).toBe(3);
  });

  it("lets an unrelated write error through untranslated", async () => {
    // The duplicate-key translation must not become a catch-all: a validation
    // failure reported as "a plan with this group and frequency already exists"
    // would send an admin looking for a plan that does not exist.
    const { createPlan } = await planService();
    const input = planInput();
    delete (input as Partial<IPlan>).price;

    const err = await captureError(createPlan(input));

    expect(err.name).toBe("ValidationError");
  });
});

describe("getPlanById", () => {
  it("returns a plain object rather than a hydrated document", async () => {
    // `.lean()` is load-bearing for the caller: subscription.controller.ts
    // passes this straight into `createOrUpdatePendingSubscription`, which
    // reads `plan.trialPeriodDays` and `plan._id` off it and spreads it into
    // the Paymob intention.
    const { getPlanById } = await planService();
    const plan = await seedPlan({ price: 499 });

    const found = await getPlanById(plan._id.toString());

    expect(found).not.toBeInstanceOf(mongoose.Document);
    expect(found.price).toBe(499);
  });

  it("rejects an unknown plan", async () => {
    const { getPlanById } = await planService();

    const err = await captureError(
      getPlanById(new mongoose.Types.ObjectId().toString()),
    );

    expect(err.message).toBe(errMsg.PLAN_NOT_FOUND.en);
    expect(err.statusCode).toBe(404);
  });

  it("throws a CastError for a malformed id, which the route now refuses first", async () => {
    // Documents where the guard lives rather than endorsing this behaviour.
    // `GET /plans/:id` is public, so `/plans/garbage` used to be an
    // unauthenticated way to raise a Mongoose CastError — not a CustomError,
    // and not a shape the global error handler names — which became a 500 and
    // a Sentry event for a plainly bad request. Every `/plans/:id` route now
    // carries `planIdParamValidator`, so that is a 422 before any handler runs.
    const { getPlanById } = await planService();

    const err = await captureError(getPlanById("not-an-object-id"));

    expect(err.name).toBe("CastError");
    expect(err.statusCode).toBeUndefined();
  });
});

describe("getAllPlans", () => {
  it("returns every plan that is on sale", async () => {
    const { getAllPlans } = await planService();
    await seedPlan();
    await seedPlan({ planGroup: "Pro" });

    const plans = await getAllPlans();

    expect(plans).toHaveLength(2);
    expect(plans[0]).not.toBeInstanceOf(mongoose.Document);
  });

  it("returns an empty list rather than throwing when there are no plans", async () => {
    const { getAllPlans } = await planService();

    await expect(getAllPlans()).resolves.toEqual([]);
  });

  it("regression: withholds deactivated plans from the public listing", async () => {
    // `GET /plans` is unauthenticated and returns this list verbatim. The only
    // thing that used to hide a deactivated plan was
    // `plansApiService.getActivePlans()` filtering client-side — and its
    // sibling `getPlans()` does not filter at all — so "deactivate" meant
    // "hide it in one of the two places the frontend asks", which is not a
    // control.
    const { getAllPlans } = await planService();
    await seedPlan({ planGroup: "Starter", isActive: true });
    await seedPlan({ planGroup: "Retired", isActive: false });

    const plans = await getAllPlans();

    expect(plans).toHaveLength(1);
    expect(plans[0].planGroup).toBe("Starter");
  });

  it("serves the retired ones too when the caller asks for them", async () => {
    // The other direction, and the one that keeps a deactivation reversible: an
    // admin listing has to be able to see a plan it took off sale in order to
    // put it back. No endpoint passes this yet — building one needs a handler
    // in plans.controller.ts — so this pins the capability rather than a route.
    const { getAllPlans } = await planService();
    await seedPlan({ planGroup: "Starter", isActive: true });
    await seedPlan({ planGroup: "Retired", isActive: false });

    const plans = await getAllPlans({ includeInactive: true });

    expect(plans).toHaveLength(2);
  });
});

describe("getPlanSByGroup", () => {
  it("returns only the plans in the requested group", async () => {
    const { getPlanSByGroup } = await planService();
    await seedPlan({ planGroup: "Starter", frequency: "monthly" });
    await seedPlan({ planGroup: "Starter", frequency: "yearly" });
    await seedPlan({ planGroup: "Pro" });

    const plans = await getPlanSByGroup("Starter");

    expect(plans).toHaveLength(2);
    expect(plans.every((p) => p.planGroup === "Starter")).toBe(true);
  });

  it("returns an empty list for a group that does not exist", async () => {
    const { getPlanSByGroup } = await planService();
    await seedPlan({ planGroup: "Starter" });

    await expect(getPlanSByGroup("Nonexistent")).resolves.toEqual([]);
  });

  it("an undefined group matches nothing rather than everything", async () => {
    // Worth pinning because the intuition points the wrong way, and this
    // codebase has been bitten by the mirror-image case: an `undefined` in a
    // `$set` *is* stripped by Mongoose, which is what once orphaned every
    // re-subscription from its webhooks. In a filter it is not stripped — it
    // casts to null and matches no document — so a missing selector here is a
    // match-none, not the "returns the whole collection" hazard it looks like.
    // The only caller uses the result to decide whether a duplicate plan
    // already exists, and a match-all would make that check refuse every
    // creation.
    const { getPlanSByGroup } = await planService();
    await seedPlan({ planGroup: "Starter" });
    await seedPlan({ planGroup: "Pro" });

    const plans = await getPlanSByGroup(undefined as unknown as string);

    expect(plans).toEqual([]);
  });
});

describe("updatePlan", () => {
  it("saves every field an admin may legitimately edit", async () => {
    // Both directions of an allowlist need a test, and this is the direction
    // that gets forgotten: an earlier allowlist in this codebase was built
    // from its validator, silently stripped two legitimate fields from every
    // update while still returning 200, and shipped — because the existing
    // test only asserted fields that happened to be on the list. These are
    // every field `updatePlanValidator` names, plus `title`, which the create
    // path derives and this is the only way to correct.
    const { updatePlan } = await planService();
    const plan = await seedPlan();

    const updated = await updatePlan(plan._id.toString(), {
      planGroup: "Pro",
      title: "Pro (yearly - USD)",
      description: "The bigger one",
      frequency: "yearly",
      currency: "USD",
      price: 1999,
      features: ["QR menu", "Analytics"],
      trialPeriodDays: 7,
    });

    const expected = {
      planGroup: "Pro",
      title: "Pro (yearly - USD)",
      description: "The bigger one",
      frequency: "yearly",
      currency: "USD",
      price: 1999,
      features: ["QR menu", "Analytics"],
      trialPeriodDays: 7,
    };
    expect(updated).toMatchObject(expected);
    // Assert against the database as well as the return value — a returned
    // document that was never written is exactly the failure mode here.
    expect(await Plans.findById(plan._id).lean()).toMatchObject(expected);
  });

  it("leaves fields the caller did not send alone", async () => {
    const { updatePlan } = await planService();
    const plan = await seedPlan({ price: 299, description: "Original copy" });

    await updatePlan(plan._id.toString(), { price: 349 });

    const stored = await Plans.findById(plan._id).lean();
    expect(stored!.price).toBe(349);
    expect(stored!.description).toBe("Original copy");
  });

  it("regression: refuses to repoint the Paymob plan id", async () => {
    // `paymobPlanId` is the link to the live recurring mandate. Every
    // subscription created against this plan quotes it when it builds the
    // intention, so overwriting it silently moves future billing onto a
    // different Paymob plan — a different amount, possibly a different
    // frequency — with nothing in the app showing that anything changed. It
    // is not in `updatePlanValidator`, but express-validator only checks the
    // fields it names; it does not strip the ones it doesn't, so before the
    // allowlist this arrived here and was written.
    const { updatePlan } = await planService();
    const plan = await seedPlan({ paymobPlanId: 11405 });

    await updatePlan(plan._id.toString(), {
      price: 349,
      paymobPlanId: 99999,
    } as Parameters<typeof updatePlan>[1]);

    const stored = await Plans.findById(plan._id).lean();
    expect(stored!.paymobPlanId).toBe(11405);
    // The legitimate half of the same request still lands.
    expect(stored!.price).toBe(349);
  });

  it("regression: refuses to take a plan off sale through the general update", async () => {
    // Deactivation has its own endpoint, its own validator and its own
    // `activateOrDeactivatePlan`. `updatePlan`'s signature already excludes
    // `isActive`, but that was a type-level claim only — at runtime the field
    // travelled in `req.body` and was written.
    const { updatePlan } = await planService();
    const plan = await seedPlan({ isActive: true });

    await updatePlan(plan._id.toString(), { isActive: false } as Parameters<
      typeof updatePlan
    >[1]);

    expect((await Plans.findById(plan._id).lean())!.isActive).toBe(true);
  });

  it("regression: ignores _id and createdAt in the payload", async () => {
    // `_id` was the sharper of the two: passing it to findByIdAndUpdate makes
    // Mongoose throw "Performing an update on the path '_id' would modify the
    // immutable field '_id'", which is not a CustomError and so becomes a 500
    // — an unauthenticated-shaped crash triggerable by an admin typo.
    const { updatePlan } = await planService();
    const plan = await seedPlan();
    const createdAt = (await Plans.findById(plan._id).lean())!.createdAt;
    const otherId = new mongoose.Types.ObjectId();

    const updated = await updatePlan(plan._id.toString(), {
      _id: otherId,
      createdAt: new Date("2000-01-01"),
      price: 349,
    } as unknown as Parameters<typeof updatePlan>[1]);

    expect(String(updated._id)).toBe(String(plan._id));
    const stored = await Plans.findById(plan._id).lean();
    expect(stored!.createdAt.getTime()).toBe(createdAt.getTime());
    expect(stored!.price).toBe(349);
  });

  it("treats a payload of nothing but unknown fields as a no-op", async () => {
    const { updatePlan } = await planService();
    const plan = await seedPlan({ price: 299 });

    const updated = await updatePlan(plan._id.toString(), {
      somethingElse: true,
    } as unknown as Parameters<typeof updatePlan>[1]);

    expect(updated.price).toBe(299);
  });

  it("returns a plain object", async () => {
    const { updatePlan } = await planService();
    const plan = await seedPlan();

    const updated = await updatePlan(plan._id.toString(), { price: 349 });

    expect(updated).not.toBeInstanceOf(mongoose.Document);
  });

  it("rejects an unknown plan", async () => {
    const { updatePlan } = await planService();

    const err = await captureError(
      updatePlan(new mongoose.Types.ObjectId().toString(), { price: 349 }),
    );

    expect(err.message).toBe(errMsg.PLAN_NOT_FOUND.en);
    expect(err.statusCode).toBe(404);
  });
});

describe("activateOrDeactivatePlan", () => {
  it("takes a plan off sale", async () => {
    const { activateOrDeactivatePlan } = await planService();
    const plan = await seedPlan({ isActive: true });

    const updated = await activateOrDeactivatePlan(plan._id.toString(), false);

    expect(updated.isActive).toBe(false);
    expect((await Plans.findById(plan._id).lean())!.isActive).toBe(false);
  });

  it("puts a plan back on sale", async () => {
    const { activateOrDeactivatePlan } = await planService();
    const plan = await seedPlan({ isActive: false });

    const updated = await activateOrDeactivatePlan(plan._id.toString(), true);

    expect(updated.isActive).toBe(true);
  });

  it("changes nothing but isActive", async () => {
    // The handler reports success by reading `plan.isActive` back off the
    // returned document, so this is also what makes that message truthful.
    const { activateOrDeactivatePlan } = await planService();
    const plan = await seedPlan({ price: 299, paymobPlanId: 11405 });

    const updated = await activateOrDeactivatePlan(plan._id.toString(), false);

    expect(updated.price).toBe(299);
    expect(updated.paymobPlanId).toBe(11405);
  });

  it("rejects an unknown plan", async () => {
    const { activateOrDeactivatePlan } = await planService();

    const err = await captureError(
      activateOrDeactivatePlan(new mongoose.Types.ObjectId().toString(), false),
    );

    expect(err.message).toBe(errMsg.PLAN_NOT_FOUND.en);
    expect(err.statusCode).toBe(404);
  });
});
