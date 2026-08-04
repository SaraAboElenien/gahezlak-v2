import { useMutation, useQuery } from "@tanstack/react-query";
import { publicShopApi } from "@/services/publicShopApi";

// Get public menu items
export const usePublicMenuItems = (slug: string) => {
  return useQuery({
    queryKey: ["publicMenuItems", slug],
    queryFn: () => publicShopApi.GetMenuItemsPublic(slug),
    enabled: !!slug,
  });
};

// Get shop details
export const usePublicShopDetails = (slug: string) => {
  return useQuery({
    queryKey: ["shopDetails", slug],
    queryFn: () => publicShopApi.getShopDetails(slug),
    // enabled: !!slug,
  });
};

// Get shop categories
export const usePublicShopCategories = (slug: string) => {
  return useQuery({
    queryKey: ["shopCategories", slug],
    queryFn: () => publicShopApi.getShopCategories(slug),
    // enabled: !!slug,
  });
};

// Ai
// export const useBatchAiProcess = (shopId: string) => {
//   return useMutation({
//     mutationFn: () => publicShopApi.sendAllItemsToAi(shopId),
//     onSuccess: (data) => {
//       console.log("Batch AI Process Success:", data);
//     },
//   });
// };

export const useSearchWithAi = () => {
  return useMutation({
    mutationFn: (params: { query: string; shopId: string; limit?: number }) =>
      publicShopApi.searchWithAi(params),
    onSuccess: (res) => {
      return res.data;
    },
  });
};
