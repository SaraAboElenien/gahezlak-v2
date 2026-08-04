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

// Hook to get a single plan by ID
export const usePlanById = (planId: string) => {
  return useQuery({
    queryKey: plansQueryKeys.detail(planId),
    queryFn: () => plansApiService.getPlanById(planId),
    enabled: !!planId, // Only run query if planId is provided
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Hook to get the first active plan (useful for pricing sections)
export const useFirstActivePlan = () => {
  return useQuery({
    queryKey: [...plansQueryKeys.active(), "first"],
    queryFn: async () => {
      const activePlans = await plansApiService.getActivePlans();
      return activePlans[0] || null;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Hook to get a specific plan by ID (recommended for consistent pricing)
export const useSpecificPlan = (planId: string) => {
  return useQuery({
    queryKey: plansQueryKeys.detail(planId),
    queryFn: () => plansApiService.getPlanById(planId),
    enabled: !!planId, // Only run query if planId is provided
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Hook to get plan by planGroup (e.g., "Premium")
export const usePlanByGroup = (planGroup: string) => {
  return useQuery({
    queryKey: [...plansQueryKeys.active(), "group", planGroup],
    queryFn: async () => {
      const activePlans = await plansApiService.getActivePlans();
      return activePlans.find((plan) => plan.planGroup === planGroup) || null;
    },
    enabled: !!planGroup,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Hook to get specific plan with fallback to first active plan
export const useSpecificPlanWithFallback = (planId: string) => {
  const specificPlanQuery = useSpecificPlan(planId);
  const firstActivePlanQuery = useFirstActivePlan();

  // If specific plan is loading, show loading
  if (specificPlanQuery.isLoading) {
    return {
      data: null,
      isLoading: true,
      error: null,
      source: "specific" as const,
    };
  }

  // If specific plan has error but first active plan is available, use fallback
  if (specificPlanQuery.error && firstActivePlanQuery.data) {
    return {
      data: firstActivePlanQuery.data,
      isLoading: false,
      error: null,
      source: "fallback" as const,
    };
  }

  // If specific plan has error and first active plan is also loading, show loading
  if (specificPlanQuery.error && firstActivePlanQuery.isLoading) {
    return {
      data: null,
      isLoading: true,
      error: null,
      source: "fallback" as const,
    };
  }

  // If specific plan has error and first active plan also has error, show error
  if (specificPlanQuery.error && firstActivePlanQuery.error) {
    return {
      data: null,
      isLoading: false,
      error: specificPlanQuery.error,
      source: "error" as const,
    };
  }

  // If specific plan is successful, use it
  if (specificPlanQuery.data) {
    return {
      data: specificPlanQuery.data,
      isLoading: false,
      error: null,
      source: "specific" as const,
    };
  }

  // Default fallback to first active plan
  return {
    data: firstActivePlanQuery.data,
    isLoading: firstActivePlanQuery.isLoading,
    error: firstActivePlanQuery.error,
    source: "fallback" as const,
  };
};
