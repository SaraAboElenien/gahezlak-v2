export interface LocalizedText {
  en: string;
  ar: string;
}
export interface Category {
  _id: string;
  shopId?: string;
  name: LocalizedText;
  description?: LocalizedText;
  createdAt?: string;
  updatedAt?: string;
  __v?: number;
}

export interface GetCategoriesResponse {
  message: string;
  data: Category[];
}

export interface MutateCategoryResponse {
  message: string;
  data: Category;
}

export interface GetCategoriesResponse {
  message: string;
  data: Category[];
}

export interface MutateCategoryResponse {
  message: string;
  data: Category;
}
