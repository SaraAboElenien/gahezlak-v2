import { axiosInstance } from "./axiosInint";

const toQueryString = (
  params: Record<string, string | number | undefined>,
): string =>
  new URLSearchParams(
    Object.entries(params).reduce<Record<string, string>>(
      (acc, [key, value]) => {
        if (value !== undefined) acc[key] = String(value);
        return acc;
      },
      {},
    ),
  ).toString();

export const adminAnalyticsApi = {
  // 🔝 Top Restaurants by Revenue
  getTopRestaurants: (params?: {
    limit?: number;
    startDate?: string;
    endDate?: string;
  }): Promise<{
    message: string;
    data: {
      totalShopRevenue: number;
      shopId: string;
      shopName: string;
    }[];
  }> => {
    const query = toQueryString(params ?? {});
    return axiosInstance
      .get(`/admin/analytics/top-restaurants${query ? `?${query}` : ""}`)
      .then((res) => res.data);
  },

  // 📈 Revenue Growth Rate between two periods
  getRevenueGrowth: (params: {
    start1: string;
    end1: string;
    start2: string;
    end2: string;
  }): Promise<{
    message: string;
    data: {
      percentageChange: number;
    };
  }> => {
    const query = toQueryString(params);
    return axiosInstance
      .get(`/admin/analytics/revenue-growth?${query}`)
      .then((res) => res.data);
  },

  // 💰 Total Revenue between startDate & endDate
  getTotalRevenue: (params: {
    startDate: string;
    endDate: string;
  }): Promise<{
    message: string;
    data: {
      totalRevenue: number;
    };
  }> => {
    const query = toQueryString(params);
    return axiosInstance
      .get(`/admin/analytics/total-revenue?${query}`)
      .then((res) => res.data);
  },
};
