import { useQuery } from "@tanstack/react-query";
import { plansApiService } from "../services/plansApi";

// Query keys for React Query
export const plansQueryKeys = {
  all: ["plans"] as const,
  lists: () => [...plansQueryKeys.all, "list"] as const,
  list: (filters: string) => [...plansQueryKeys.lists(), { filters }] as const,
  details: () => [...plansQueryKeys.all, "detail"] as const,
  detail: (id: string) => [...plansQueryKeys.details(), id] as const,
  active: () => [...plansQueryKeys.all, "active"] as const,
};

// Hook to get all plans
export const usePlans = () => {
  return useQuery({
    queryKey: plansQueryKeys.lists(),
    queryFn: async () => {
      const response = await plansApiService.getPlans();
      return response.data[0];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
  });
};

// Hook to get active plans only
export const useActivePlans = () => {
  return useQuery({
    queryKey: plansQueryKeys.active(),
    queryFn: plansApiService.getActivePlans,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

/**
 * The plan the marketing site advertises, and the one the subscription form
 * offers. Selected by WHAT IT IS rather than by id.
 *
 * Both call sites used to hardcode the ObjectId `688399b2e32b453c443937ff`,
 * which belonged to an older database and does not exist in this one. Every
 * landing-page view therefore fired a guaranteed-404 `GET /plans/<id>`, and a
 * withFallback wrapper quietly swallowed it and substituted
 * `getActivePlans()[0]`. Two things were wrong with that, and the second is
 * the worse one:
 *
 *   - a wasted round trip that always failed, doubling the section's render
 *     time on the free tier's cold start and burying real 404s in the log;
 *   - the advertised price was not a chosen plan at all. It was whatever
 *     happened to sort first, so adding or reordering a plan would silently
 *     change the price on the public page with nothing looking broken.
 *
 * Selecting on `planGroup` + `frequency` is stable against reordering, cannot
 * 404, and states the intent in the code. When the advertised plan is absent
 * the hook resolves to `null` so the caller can say so, rather than
 * advertising a different plan's price.
 */
export const ADVERTISED_PLAN = {
  planGroup: "Starter",
  frequency: "monthly",
} as const;

export const useAdvertisedPlan = () => {
  return useQuery({
    queryKey: [...plansQueryKeys.active(), "advertised"],
    // `getActivePlans` requests /plans and drops inactive ones, so a retired
    // plan left in the collection can never become the advertised price.
    queryFn: plansApiService.getActivePlans,
    select: (plans) =>
      plans.find(
        (plan) =>
          plan.planGroup === ADVERTISED_PLAN.planGroup &&
          plan.frequency === ADVERTISED_PLAN.frequency,
      ) ?? null,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};
