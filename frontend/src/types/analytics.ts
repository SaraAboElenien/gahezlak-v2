import type { LocalizedText } from "./menuItem";

export interface CancellationRateData {
  totalOrders: number;
  canceledOrders: number;
  cancellationRate: number;
}

export interface CancellationRateResponse {
  message: string;
  data: CancellationRateData;
}

export interface OrderCountByDate {
  _id: { year: number; month?: number; day?: number };
  count: number;
}

export interface OrderCountsResponse {
  message: string;
  data: OrderCountByDate[];
}

export interface SalesComparisonData {
  total1: number;
  total2: number;
  percentageChange: number;
}

export interface SalesComparisonResponse {
  message: string;
  data: SalesComparisonData;
}

export interface SellerEntry {
  menuItemId: string;
  name: LocalizedText;
  total: number;
}

export interface BestAndWorstSellersData {
  bestSellers: SellerEntry[];
  worstSellers: SellerEntry[];
}

export interface BestAndWorstSellersResponse {
  message: string;
  data: BestAndWorstSellersData;
}

export interface TotalRevenueResponse {
  message: string;
  data: number;
}
