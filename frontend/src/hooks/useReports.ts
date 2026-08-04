import { useMutation, useQuery } from "@tanstack/react-query";
import {
  reportApi,
  type AdminReportFormData,
  type ShopReportFormData,
} from "@/services/reportApi";

// Contact Admin
export const useContactAdmin = () =>
  useMutation({
    mutationFn: (data: AdminReportFormData) => reportApi.contactAdmin(data),
  });

// Contact Shop
export const useContactShop = (shopName: string) =>
  useMutation({
    mutationFn: (data: ShopReportFormData) =>
      reportApi.contactShop(shopName, data),
  });

// Get Admin Reports
export const useAdminReports = () =>
  useQuery({
    queryKey: ["adminReports"],
    queryFn: () => reportApi.getAdminReports(),
  });

// Get Shop Reports
export const useShopReports = () =>
  useQuery({
    queryKey: ["shopReports"],
    queryFn: () => reportApi.getShopReports(),
  });
