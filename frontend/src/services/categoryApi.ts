import type {
  GetCategoriesResponse,
  MutateCategoryResponse,
} from "@/types/category";
import { axiosInstance } from "./axiosInint";
import type { CategoryFormInputs } from "@/types/validations/menu/category";

export const categoryApi = {
  GetCategories: (): Promise<GetCategoriesResponse> => {
    return axiosInstance.get("/shops/categories").then((res) => res.data);
  },
  CreateCategory: (
    data: CategoryFormInputs,
  ): Promise<MutateCategoryResponse> => {
    return axiosInstance
      .post("/shops/categories", data)
      .then((res) => res.data);
  },
  UpdateCategory: (
    data: CategoryFormInputs,
    id: string,
  ): Promise<MutateCategoryResponse> => {
    return axiosInstance
      .put(`/shops/categories/${id}`, data)
      .then((res) => res.data);
  },
  DeleteCategory: (id: string): Promise<MutateCategoryResponse> => {
    return axiosInstance
      .delete(`/shops/categories/${id}`)
      .then((res) => res.data);
  },
};
