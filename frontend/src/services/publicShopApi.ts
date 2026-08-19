import type { GetCategoriesResponse } from "@/types/category";
import { axiosInstance } from "./axiosInint";
import type {
  AiSearchResponse,
  EnrichSummaryResponse,
  GetMenuItemsResponse,
} from "@/types/menuItem";
import type { PublicShopResponse } from "@/types/shop";
import axios from "axios";
import { BASE_URL } from "@/config/api";

//======================== PUBLIC MENU AVAILABLE TO USERS ============================
export const publicShopApi = {
  GetMenuItemsPublic: (slug: string): Promise<GetMenuItemsResponse> => {
    return axios
      .get(`${BASE_URL}/shops/name/${slug}/menu-items`)
      .then((res) => res.data);
  },

  getShopDetails: (slug: string): Promise<PublicShopResponse> => {
    return axios.get(`${BASE_URL}/shops/name/${slug}`).then((res) => res.data);
  },

  getShopCategories: (slug: string): Promise<GetCategoriesResponse> => {
    return axios
      .get(`${BASE_URL}/shops/name/${slug}/categories`)
      .then((res) => res.data);
  },

  /**
   * Derive allergens, dietary tags and ingredients for a whole shop's menu.
   *
   * This is what makes allergy and dietary search work: the search endpoint
   * filters on the data this produces, and until a shop has been enriched
   * every result comes back flagged unsafe rather than silently unfiltered.
   *
   * These replace two commented-out calls to `/ai/menu/batch-process`, an
   * endpoint that no longer exists — because it was never called, the
   * enrichment step never ran and the underlying collection stayed empty.
   *
   * Pass `force` to re-run over items that already have data (after editing
   * a menu item's description, say); the default skips them.
   *
   * No shopId argument: the backend takes it from the caller's token. The
   * dashboard has no shop id in context — that is why this call previously
   * had no caller anywhere in the app, and why enrichment never ran.
   */
  enrichShopMenu: (force = false): Promise<EnrichSummaryResponse> => {
    return axiosInstance
      .post("/ai/menu/enrich-all", { force })
      .then((res) => res.data);
  },

  /** Same, for a single menu item. */
  enrichMenuItem: (itemId: string): Promise<EnrichSummaryResponse> => {
    return axiosInstance
      .post(`/ai/menu/enrich/${itemId}`)
      .then((res) => res.data);
  },

  // search with ai
  searchWithAi: (params: {
    query: string;
    shopId: string;
    limit?: number;
  }): Promise<AiSearchResponse> => {
    return axiosInstance
      .post(`/ai/menu/super-search`, params)
      .then((res) => res.data);
  },
};
