import type { ShopFormData } from "@/types/validations/user/shop.schema";
import { axiosInstance } from "./axiosInint";
import type {
  RegenerateQrCodeResponse,
  UserProfileResponse,
} from "@/types/user";
import type { GetShopByAdminResponse, Shop } from "@/types/shop";
import type { Category } from "@/types/category";

export const shopApi = {
  CreateShop: (data: ShopFormData): Promise<UserProfileResponse> => {
    // Create FormData for file upload
    const formData = new FormData();

    // Add text fields
    formData.append("name", data.name);
    formData.append("type", data.type);
    formData.append("address[country]", data.address.country);
    formData.append("address[city]", data.address.city);
    formData.append("address[street]", data.address.street);
    formData.append("phoneNumber", data.phoneNumber);
    formData.append("email", data.email);

    // Add file if present - backend expects field name 'logo'
    if (data.logoUrl && data.logoUrl.length > 0) {
      formData.append("logo", data.logoUrl[0]);
    }

    return axiosInstance
      .post("/shops", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      })
      .then((res) => res.data);
  },

  GetShopByName: (shopName: string): Promise<Shop> => {
    return axiosInstance.get(`/shops/${shopName}`).then((res) => res.data);
  },

  // Get Shop by ID (Staff)
  GetShopById: (id: string): Promise<GetShopByAdminResponse> => {
    return axiosInstance.get(`/shops/id/${id}`).then((res) => res.data);
  },

  GetShopCategories: (shopName: string): Promise<Category[]> => {
    return axiosInstance
      .get(`/shops/${shopName}/categories`)
      .then((res) => res.data);
  },

  UpdateShop: (
    id: string,
    formData: FormData,
  ): Promise<UserProfileResponse> => {
    return axiosInstance
      .put(`/shops/id/${id}`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      })
      .then((res) => res.data);
  },

  RegenerateQrCode: (data: {
    width: number;
    margin: number;
    errorCorrectionLevel: string;
  }): Promise<RegenerateQrCodeResponse> => {
    return axiosInstance.post(`/shops/qr-code`, data).then((res) => res.data);
  },
};
