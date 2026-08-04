import { adminAnalyticsApi } from "@/services/adminAnalyticsApi";
import { useQuery } from "@tanstack/react-query";

// 🔝 Top Restaurants by Revenue
export const useTopRestaurants = (params?: {
  limit?: number;
  startDate?: string;
  endDate?: string;
}) =>
  useQuery({
    queryKey: ["topRestaurants", params],
    queryFn: () => adminAnalyticsApi.getTopRestaurants(params),
  });

// 📈 Revenue Growth Rate between two periods
export const useRevenueGrowth = (params: {
  start1: string;
  end1: string;
  start2: string;
  end2: string;
}) =>
  useQuery({
    queryKey: ["revenueGrowth", params],
    queryFn: () => adminAnalyticsApi.getRevenueGrowth(params),
  });

// 💰 Total Revenue in range
export const useAdminTotalRevenue = (params: {
  startDate: string;
  endDate: string;
}) =>
  useQuery({
    queryKey: ["totalRevenue", params],
    queryFn: () => adminAnalyticsApi.getTotalRevenue(params),
  });
