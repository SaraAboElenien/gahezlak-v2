import { axiosInstance } from "./axiosInint";

// Response types
export interface SubscriptionResponse {
  success: boolean;
  message: string;
  subscriptionId?: string;
  data?: Record<string, unknown>;
}

export interface SubscriptionError {
  success: false;
  message: string;
  error?: string;
}

export interface SubscriptionStatusResponse {
  success: boolean;
  data: {
    status: string;
    subscriptionId: string;
    planId: string;
    startDate: string;
    endDate?: string;
    trialEndDate?: string;
  };
}

// Subscription API Service Functions
export const subscriptionApiService = {
  // Create a new subscription
  createSubscription: async (data: string): Promise<SubscriptionResponse> => {
    try {
      const response = await axiosInstance.post("/subscriptions", {
        planId: data,
      });

      return response.data;
    } catch (error: unknown) {
      // Handle axios errors
      if (error && typeof error === "object" && "response" in error) {
        // Server responded with error status
        const errorData = (
          error as { response: { data: { message?: string }; status: number } }
        ).response.data;
        throw new Error(
          errorData.message ||
            `Subscription failed: ${
              (error as { response: { status: number } }).response.status
            }`,
        );
      } else if (error && typeof error === "object" && "request" in error) {
        // Network error
        throw new Error("Network error. Please check your connection.");
      } else {
        // Other error
        throw new Error("Subscription failed. Please try again.");
      }
    }
  },

  // Get subscription status (for future use)
  getSubscriptionStatus: async (
    subscriptionId: string,
  ): Promise<SubscriptionStatusResponse> => {
    try {
      const response = await axiosInstance.get(
        `/payments/subscribe/${subscriptionId}`,
      );
      return response.data;
    } catch (error: unknown) {
      if (error && typeof error === "object" && "response" in error) {
        const errorData = (
          error as { response: { data: { message?: string }; status: number } }
        ).response.data;
        throw new Error(
          errorData.message ||
            `Failed to get subscription status: ${
              (error as { response: { status: number } }).response.status
            }`,
        );
      } else if (error && typeof error === "object" && "request" in error) {
        throw new Error("Network error. Please check your connection.");
      } else {
        throw new Error("Failed to get subscription status.");
      }
    }
  },

  // Cancel subscription
  cancelSubscription: async (): Promise<SubscriptionResponse> => {
    try {
      const response = await axiosInstance.post(`/shops/subscription/cancel`);
      return response.data;
    } catch (error: unknown) {
      if (error && typeof error === "object" && "response" in error) {
        const errorData = (
          error as { response: { data: { message?: string }; status: number } }
        ).response.data;
        throw new Error(
          errorData.message ||
            `Failed to cancel subscription: ${
              (error as { response: { status: number } }).response.status
            }`,
        );
      } else if (error && typeof error === "object" && "request" in error) {
        throw new Error("Network error. Please check your connection.");
      } else {
        throw new Error("Failed to cancel subscription.");
      }
    }
  },
};
