import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { subscriptionApiService } from "../services/subscriptionApi";
import { useProfile } from "./useProfile";
import { useMemo } from "react";

// Query keys for React Query
export const subscriptionQueryKeys = {
  all: ["subscriptions"] as const,
  lists: () => [...subscriptionQueryKeys.all, "list"] as const,
  details: () => [...subscriptionQueryKeys.all, "detail"] as const,
  detail: (id: string) => [...subscriptionQueryKeys.details(), id] as const,
};

// Constants for subscription statuses
export const VALID_SUBSCRIPTION_STATUSES = ["active", "trialing"] as const;
export const CANCELLED_SUBSCRIPTION_STATUSES = [
  "cancelled",
  "CANCELLED",
] as const;
export const PENDING_SUBSCRIPTION_STATUSES = ["pending"] as const;
export const TRIAL_PERIOD_DAYS = 7;

// Hook to get user subscription data from profile
export const useUserSubscription = () => {
  const { user: userData, loading: isLoading, error } = useProfile();

  const subscriptionData = useMemo(() => {
    try {
      // Check if user has subscription data
      if (!userData?.shop?.subscriptionId) {
        return null;
      }

      const subscription = userData.shop.subscriptionId;

      // Validate subscription structure
      if (!subscription || !subscription.plan) {
        console.warn("Invalid subscription structure:", subscription);
        return null;
      }

      const plan = subscription.plan;

      // Validate required fields
      if (
        !subscription.currentPeriodStart ||
        !subscription.currentPeriodEnd ||
        !subscription.status
      ) {
        console.warn("Missing required subscription fields:", subscription);
        return null;
      }

      // Calculate days remaining
      const now = new Date();
      const periodEnd = new Date(subscription.currentPeriodEnd);
      const periodStart = new Date(subscription.currentPeriodStart);

      // Validate dates
      if (isNaN(periodEnd.getTime()) || isNaN(periodStart.getTime())) {
        console.warn("Invalid dates in subscription:", subscription);
        return null;
      }

      // Determine if still in trial period
      const isInTrial = subscription.status === "trialing";

      // Calculate days remaining
      let daysRemaining = 0;
      let totalDays = 0;

      if (isInTrial) {
        // Use the periodEnd from API for trial periods (backend calculates 7 days)
        // Time-aware calculation: starts at 0 when subscribed, increments to 1 at midnight
        const end = new Date(periodEnd);
        const start = new Date(periodStart);

        // Calculate total period in days
        const totalPeriodMs = end.getTime() - start.getTime();
        totalDays = Math.ceil(totalPeriodMs / (1000 * 60 * 60 * 24));

        // Calculate remaining days
        const remainingMs = end.getTime() - now.getTime();
        const daysDifference = remainingMs / (1000 * 60 * 60 * 24);
        daysRemaining = Math.max(0, Math.ceil(daysDifference));
      } else {
        // Regular subscription period calculation
        // Time-aware calculation: starts at 0 when subscribed, increments to 1 at midnight
        const end = new Date(periodEnd);
        const start = new Date(periodStart);

        // Calculate total period in days
        const totalPeriodMs = end.getTime() - start.getTime();
        totalDays = Math.ceil(totalPeriodMs / (1000 * 60 * 60 * 24));

        // Calculate remaining days
        const remainingMs = end.getTime() - now.getTime();
        const daysDifference = remainingMs / (1000 * 60 * 60 * 24);
        daysRemaining = Math.max(0, Math.ceil(daysDifference));
      }

      return {
        subscription,
        plan,
        status: subscription.status,
        isInTrial,
        daysRemaining,
        totalDays,
        periodStart: subscription.currentPeriodStart,
        periodEnd: subscription.currentPeriodEnd,
      };
    } catch (error) {
      console.error("Error processing subscription data:", error);
      return null;
    }
  }, [userData]);

  // Check if user has a valid subscription
  const hasValidSubscription = useMemo(() => {
    if (!subscriptionData) return false;

    // Check if the subscription period has ended
    const now = new Date();
    const periodEnd = new Date(subscriptionData.periodEnd);

    // If currentPeriodEnd is in the past, subscription is expired regardless of status
    if (periodEnd.getTime() <= now.getTime()) {
      return false;
    }

    // If currentPeriodEnd is in the future, user has access regardless of status
    // This means cancelled subscriptions still work until the paid period ends
    return true;
  }, [subscriptionData]);

  // Check if user has a pending subscription
  const hasPendingSubscription = useMemo(() => {
    return (
      !!subscriptionData &&
      PENDING_SUBSCRIPTION_STATUSES.includes(
        subscriptionData.status as (typeof PENDING_SUBSCRIPTION_STATUSES)[number],
      )
    );
  }, [subscriptionData]);

  // Check if subscription is cancelled but still within paid period
  const hasCancelledButActiveSubscription = useMemo(() => {
    if (!subscriptionData) return false;

    const now = new Date();
    const periodEnd = new Date(subscriptionData.periodEnd);

    // Check if subscription is cancelled but period hasn't ended yet
    return (
      CANCELLED_SUBSCRIPTION_STATUSES.includes(
        subscriptionData.status as (typeof CANCELLED_SUBSCRIPTION_STATUSES)[number],
      ) && periodEnd.getTime() > now.getTime()
    );
  }, [subscriptionData]);

  // Check if subscription is fully expired (cancelled and period ended)
  const hasExpiredSubscription = useMemo(() => {
    if (!subscriptionData) return false;

    const now = new Date();
    const periodEnd = new Date(subscriptionData.periodEnd);

    // Check if subscription is cancelled and period has ended
    return (
      CANCELLED_SUBSCRIPTION_STATUSES.includes(
        subscriptionData.status as (typeof CANCELLED_SUBSCRIPTION_STATUSES)[number],
      ) && periodEnd.getTime() <= now.getTime()
    );
  }, [subscriptionData]);

  return {
    data: subscriptionData,
    isLoading,
    error,
    userData,
    hasSubscription: !!userData?.shop?.subscriptionId,
    hasValidSubscription,
    hasPendingSubscription,
    hasCancelledButActiveSubscription,
    hasExpiredSubscription,
  };
};

// Hook to create a new subscription
export const useCreateSubscription = () => {
  return useMutation({
    mutationFn: (data: string) =>
      subscriptionApiService.createSubscription(data),
    onSuccess: (data) => {
      console.log("Subscription created successfully:", data);
    },
    onError: (error) => {
      console.error("Failed to create subscription:", error);
    },
  });
};

// Hook to get subscription status
export const useSubscriptionStatus = (subscriptionId: string) => {
  return useQuery({
    queryKey: subscriptionQueryKeys.detail(subscriptionId),
    queryFn: () => subscriptionApiService.getSubscriptionStatus(subscriptionId),
    enabled: !!subscriptionId, // Only run query if subscriptionId is provided
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Hook to cancel subscription
export const useCancelSubscription = () => {
  const queryClient = useQueryClient();
  const { refreshProfile } = useProfile();

  return useMutation({
    mutationFn: () => subscriptionApiService.cancelSubscription(),
    onSuccess: (data) => {
      console.log("Subscription cancelled successfully:", data);

      // Invalidate any react-query consumers, and refresh the hand-rolled
      // UserProvider profile state (not react-query-backed) so subscription
      // status actually updates in the UI without a manual reload.
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      refreshProfile();
    },
    onError: (error) => {
      console.error("Failed to cancel subscription:", error);
    },
  });
};
