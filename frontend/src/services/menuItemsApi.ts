import { axiosInstance } from "./axiosInint";
import type {
  GetMenuItemsResponse,
  MutateMenuItemsResponse,
} from "@/types/menuItem";
import type { MenuItemFormInputs } from "@/types/validations/menu/items";

export const menuItemApi = {
  GetMenuItems: (): Promise<GetMenuItemsResponse> => {
    return axiosInstance.get("/shops/menu-items").then((res) => res.data);
  },
  CreateMenuItem: (
    data: MenuItemFormInputs | FormData,
  ): Promise<MutateMenuItemsResponse> => {
    const isFormData = data instanceof FormData;
    const config = {
      headers: {
        "Content-Type": isFormData ? "multipart/form-data" : "application/json",
      },
    };
    return axiosInstance
      .post("/shops/menu-items", data, config)
      .then((res) => res.data);
  },
  UpdateMenuItem: (
    data: MenuItemFormInputs | FormData,
    id: string,
  ): Promise<MutateMenuItemsResponse> => {
    const isFormData = data instanceof FormData;
    const config = {
      headers: {
        "Content-Type": isFormData ? "multipart/form-data" : "application/json",
      },
    };
    return axiosInstance
      .patch(`/shops/menu-items/${id}`, data, config)
      .then((res) => res.data);
  },
  DeleteMenuItem: (id: string): Promise<MutateMenuItemsResponse> => {
    return axiosInstance
      .delete(`/shops/menu-items/${id}`)
      .then((res) => res.data);
  },
};
