import { axiosInstance } from "./axiosInint";
import type {
  BestAndWorstSellersResponse,
  CancellationRateResponse,
  SalesComparisonResponse,
  OrderCountsResponse,
  TotalRevenueResponse,
} from "@/types/analytics";

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

export const analyticsApi = {
  getBestWorstSellers: (params?: {
    limit?: number;
    startDate?: string;
    endDate?: string;
  }): Promise<BestAndWorstSellersResponse> => {
    const query = toQueryString(params ?? {});
    return axiosInstance
      .get(`/shops/analysis/best-worst-sellers${query ? `?${query}` : ""}`)
      .then((res) => res.data);
  },

  getCancellationRate: (): Promise<CancellationRateResponse> => {
    return axiosInstance
      .get("/shops/analysis/cancellation-rate")
      .then((res) => res.data);
  },

  getSalesComparisonRange: (params: {
    start1: string;
    end1: string;
    start2: string;
    end2: string;
  }): Promise<SalesComparisonResponse> => {
    const query = toQueryString(params);
    return axiosInstance
      .get(`/shops/analysis/sales-comparison?${query}`)
      .then((res) => res.data);
  },

  getOrderCounts: (
    period: "daily" | "monthly" | "yearly",
  ): Promise<OrderCountsResponse> => {
    return axiosInstance
      .get(`/shops/analysis/order-counts?period=${period}`)
      .then((res) => res.data);
  },

  getTotalRevenu: (): Promise<TotalRevenueResponse> => {
    return axiosInstance
      .get(`/shops/analysis/total-revenue`)
      .then((res) => res.data);
  },
};
