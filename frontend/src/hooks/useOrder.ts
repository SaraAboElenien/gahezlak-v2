import { orderApi } from "@/services/OrderApi";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateOrderRequest } from "@/types/order";
import { createOrder } from "@/services/OrderApi";

export const useOrdersByShop = (page: number, limit: number) =>
  useQuery({
    queryKey: ["orders", page, limit],
    queryFn: () => orderApi.getOrders(page, limit).then((res) => res.data),
    staleTime: 15000,
    refetchInterval: 15000,
  });

export const useKitchenOrders = (shopId: string) =>
  useQuery({
    queryKey: ["kitchenOrders", shopId],
    queryFn: () => orderApi.getKitchenOrders(shopId).then((res) => res.data),
  });

export const useOrderById = (orderId: string) =>
  useQuery({
    queryKey: ["order", orderId],
    queryFn: () => orderApi.getOrderById(orderId).then((res) => res.data),
    enabled: !!orderId,
  });

export const useSendOrderToKitchen = () =>
  useMutation({
    mutationFn: ({ shopId, orderId }: { shopId: string; orderId: string }) =>
      orderApi.sendOrderToKitchen(shopId, orderId),
  });

export const useUpdateOrderStatus = () =>
  useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: string }) =>
      orderApi.updateOrderStatus(orderId, status),
  });

export const useRoles = () =>
  useQuery({
    queryKey: ["roles"],
    queryFn: () => orderApi.getRoles().then((res) => res.data),
  });

export const useMenuItem = (itemId: string) =>
  useQuery({
    queryKey: ["menuItem", itemId],
    queryFn: () => orderApi.getMenuItem(itemId).then((res) => res.data),
    enabled: !!itemId,
  });

// React Query mutation for creating an order
export const useCreateOrder = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderData: CreateOrderRequest) => createOrder(orderData),
    onSuccess: () => {
      // Invalidate order-related queries for real-time updates
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["kitchenOrders"] });
      queryClient.invalidateQueries({ queryKey: ["order"] });
    },
  });
};
