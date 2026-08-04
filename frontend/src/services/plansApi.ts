import { axiosInstance } from "./axiosInint";

export interface PricingPlan {
  _id: string;
  planGroup: string;
  title: string;
  description: string;
  frequency: string;
  currency: string;
  price: number;
  features: string[];
  trialPeriodDays: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  __v: number;
}

export interface PlansApiResponse {
  message: string;
  data: PricingPlan[];
}

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}

// Plans API Service Functions
export const plansApiService = {
  // Get all pricing plans
  getPlans: async (): Promise<PlansApiResponse> => {
    try {
      const response = await axiosInstance.get("/plans");
      return response.data;
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Failed to fetch plans",
      );
    }
  },

  // Get a single plan by ID
  getPlanById: async (planId: string): Promise<PricingPlan> => {
    try {
      const response = await axiosInstance.get(`/plans/${planId}`);
      return response.data.data;
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Failed to fetch plan",
      );
    }
  },

  // Get active plans only
  getActivePlans: async (): Promise<PricingPlan[]> => {
    try {
      const response = await axiosInstance.get("/plans");
      const allPlans = response.data.data;
      return allPlans.filter((plan: PricingPlan) => plan.isActive);
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Failed to fetch active plans",
      );
    }
  },
};
