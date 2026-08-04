// src/hooks/useAuth.ts
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ShopFormData } from "@/types/validations/user/shop.schema";
import { shopApi } from "@/services/shopApi";
import { refreshAccessToken } from "@/services/axiosInint";

// Create Shop
export const useShop = () => {
  return useMutation({
    mutationFn: async (data: ShopFormData) => {
      const result = await shopApi.CreateShop(data);

      // Shop creation changes the user's role/shopId, which are embedded in
      // the JWT — refresh so subsequent requests carry the updated claims.
      // Don't fail shop creation itself if this refresh fails.
      const newAccessToken = await refreshAccessToken();
      if (!newAccessToken) {
        console.warn("Failed to refresh token after shop creation");
      }

      return result;
    },
  });
};

export const useShopData = (shopName: string) => {
  return useQuery({
    queryKey: ["shop", shopName],
    queryFn: () => shopApi.GetShopByName(shopName),
    enabled: !!shopName,
  });
};

export const useShopCategories = (shopName: string) => {
  return useQuery({
    queryKey: ["shop-categories", shopName],
    queryFn: () => shopApi.GetShopCategories(shopName),
    enabled: !!shopName,
  });
};
