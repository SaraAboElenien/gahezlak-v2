export interface LocalizedText {
  en: string;
  ar: string;
}

export interface OptionChoice {
  _id: string;
  name: LocalizedText;
  price: number;
}

export interface ItemOption {
  _id: string;
  name: LocalizedText;
  type: "single" | "multiple";
  required: boolean;
  choices: OptionChoice[];
}

export interface MenuItem {
  _id?: string | undefined;
  name: LocalizedText;
  description: LocalizedText;
  price: number;
  categoryId?: string;
  isAvailable: boolean;
  imgUrl: string;
  discountPercentage?: number;
  options?: ItemOption[];
  createdAt?: string;
  updatedAt?: string;
}

export interface GetMenuItemsResponse {
  message: string;
  data: MenuItem[];
}

export interface MutateMenuItemsResponse {
  message: string;
  data: MenuItem;
}

export interface MutateMenuItemsResponse {
  message: string;
  data: MenuItem;
}

/**
 * Result of enriching menu items with allergen / dietary / ingredient data.
 * Mirrors `BulkEnrichSummary` in backend/services/ai/menu-enrich.service.ts.
 *
 * `skipped` counts items that already had data and weren't re-processed —
 * without it a second run looks like it did nothing at all.
 */
export interface EnrichSummaryResponse {
  message: string;
  data: {
    processed: number;
    failed: number;
    skipped: number;
    errors: Array<{ menuItemId: string; message: string }>;
  };
}

export interface AiSearchResponse {
  message: string;
  data: {
    safeItems: MenuItem[];
    unsafeItems: MenuItem[];
  };
}
