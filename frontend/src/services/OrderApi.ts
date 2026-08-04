import type {
  CreateOrderRequest,
  CreateOrderResponse,
  GetOrderResponse,
} from "@/types/order";
import { axiosInstance } from "./axiosInint";
import axios from "axios";
import { BASE_URL } from "@/config/api";

export const createOrder = async (orderData: CreateOrderRequest) => {
  const response = await axios.post<CreateOrderResponse>(
    `${BASE_URL}/shops/orders`,
    orderData,
  );
  return response.data;
};

export const getOrderByNumber = async (orderNumber: string) => {
  const response = await axios.get<GetOrderResponse>(
    `${BASE_URL}/shops/orders/number/${orderNumber}`,
  );
  return response.data;
};

export const orderApi = {
  getOrders: (page: number = 1, limit: number = 10) =>
    axiosInstance.get(`/shops/orders?page=${page}&limit=${limit}`),

  getOrderById: (orderId: string) =>
    axiosInstance.get(`/shops/orders/id/${orderId}`),

  updateOrderStatus: (orderId: string, status: string) =>
    axiosInstance.put(`/shops/orders/${orderId}/status`, { status }),

  getKitchenOrders: (shopId: string) =>
    axiosInstance.get(`/shops/${shopId}/orders/kitchen`),

  sendOrderToKitchen: (shopId: string, orderId: string) =>
    axiosInstance.post(`/shops/${shopId}/orders/${orderId}/sendToKitchen`),

  getRoles: () => axiosInstance.get(`/roles`),

  getMenuItem: (itemId: string) =>
    axiosInstance.get(`/shops/menu-items/${itemId}`),
};
