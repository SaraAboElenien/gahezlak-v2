import { analyticsApi } from "@/services/analyticsApi";
import { useQuery } from "@tanstack/react-query";

// Best/Worst Sellers
export const useBestWorstSellers = (params?: {
  limit?: number;
  startDate?: string;
  endDate?: string;
}) =>
  useQuery({
    queryKey: ["bestWorstSellers", params],
    queryFn: () => analyticsApi.getBestWorstSellers(params),
  });

// Cancellation Rate
export const useCancellationRate = () =>
  useQuery({
    queryKey: ["cancellationRate"],
    queryFn: analyticsApi.getCancellationRate,
  });

// Sales Comparison by Range
export const useSalesComparisonRange = (params: {
  start1: string;
  end1: string;
  start2: string;
  end2: string;
}) =>
  useQuery({
    queryKey: ["salesComparisonRange", params],
    queryFn: () => analyticsApi.getSalesComparisonRange(params),
  });

// Order Counts (daily/monthly/yearly)
export const useOrderCounts = (period: "daily" | "monthly" | "yearly") =>
  useQuery({
    queryKey: ["orderCounts", period],
    queryFn: () => analyticsApi.getOrderCounts(period),
  });

// Order Counts (daily/monthly/yearly)
export const useTotalRevenue = () =>
  useQuery({
    queryKey: ["totalRevenue"],
    queryFn: () => analyticsApi.getTotalRevenu(),
  });
