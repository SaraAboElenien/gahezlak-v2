import { useMutation, useQuery } from "@tanstack/react-query";
import { publicShopApi } from "@/services/publicShopApi";
import type { EnrichSummaryResponse } from "@/types/menuItem";

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

/**
 * Runs allergen / dietary / ingredient enrichment over the caller's whole menu.
 *
 * This is the step the AI search depends on. Until it has run for a shop, the
 * search endpoint has nothing to filter on and correctly reports every match
 * as unsafe — so the customer-facing feature looks broken rather than empty.
 * Nothing triggers it automatically (each item is a paid API call), so the
 * dashboard exposes it as an explicit action.
 *
 * Replaces a commented-out `useBatchAiProcess` that called an endpoint which
 * no longer exists.
 */
export const useEnrichShopMenu = () => {
  // `force` typed explicitly: a defaulted mutationFn parameter makes react-query
  // infer TVariables as `void`, and callers then cannot pass anything at all.
  return useMutation<EnrichSummaryResponse, Error, boolean>({
    mutationFn: (force) => publicShopApi.enrichShopMenu(force),
  });
};

export const useSearchWithAi = () => {
  return useMutation({
    mutationFn: (params: { query: string; shopId: string; limit?: number }) =>
      publicShopApi.searchWithAi(params),
    onSuccess: (res) => {
      return res.data;
    },
  });
};
