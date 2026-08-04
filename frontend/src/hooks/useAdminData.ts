import { useQuery } from "@tanstack/react-query";
import {
  getAdminUsers,
  getAdminShops,
  getAdminSubscriptions,
} from "@/services/adminApi";

// Query keys for admin data
export const adminQueryKeys = {
  users: (page: number, limit: number, search: string) =>
    ["admin", "users", page, limit, search] as const,
  shops: (page: number, limit: number, search: string) =>
    ["admin", "shops", page, limit, search] as const,
  subscriptions: (page: number, limit: number, search: string) =>
    ["admin", "subscriptions", page, limit, search] as const,
};

// Hook for admin users with automatic background refetching
export const useAdminUsers = (page: number, limit: number, search: string) => {
  return useQuery({
    queryKey: adminQueryKeys.users(page, limit, search),
    queryFn: () => getAdminUsers({ page, limit, search }),
    staleTime: 30 * 1000, // 30 seconds - data is fresh for 30 seconds
    refetchOnWindowFocus: true, // Refetch when window regains focus
    refetchOnMount: true, // Refetch when component mounts
    refetchOnReconnect: true, // Refetch when network reconnects
  });
};

// Hook for admin shops with automatic background refetching
export const useAdminShops = (page: number, limit: number, search: string) => {
  return useQuery({
    queryKey: adminQueryKeys.shops(page, limit, search),
    queryFn: () => getAdminShops({ page, limit, search }),
    staleTime: 30 * 1000, // 30 seconds - data is fresh for 30 seconds
    refetchOnWindowFocus: true, // Refetch when window regains focus
    refetchOnMount: true, // Refetch when component mounts
    refetchOnReconnect: true, // Refetch when network reconnects
  });
};

// Hook for admin subscriptions with automatic background refetching
export const useAdminSubscriptions = (
  page: number,
  limit: number,
  search: string,
) => {
  return useQuery({
    queryKey: adminQueryKeys.subscriptions(page, limit, search),
    queryFn: () => getAdminSubscriptions({ page, limit, search }),
    staleTime: 30 * 1000, // 30 seconds - data is fresh for 30 seconds
    refetchOnWindowFocus: true, // Refetch when window regains focus
    refetchOnMount: true, // Refetch when component mounts
    refetchOnReconnect: true, // Refetch when network reconnects
  });
};
