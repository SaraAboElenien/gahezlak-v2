import type { ShopFormData } from "@/types/validations/user/shop.schema";
import { axiosInstance } from "./axiosInint";
import { BASE_URL } from "@/config/api";
import type { UserProfileResponse } from "@/types/user";
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

  /**
   * The QR code image URL for a shop, computed rather than read off the
   * shop record. There is no `POST /shops/qr-code` any more — the backend
   * renders this PNG fresh on every request from the shop's *current* name
   * and `FRONTEND_URL` (see `backend/utils/qr-code-generator.ts`), so there
   * is nothing to "regenerate" and nothing worth caching client-side either.
   * Deriving it here from `shopName` (rather than trusting a stored
   * `shop.qrCodeUrl`) is what keeps it from ever going stale the way the old
   * imgbb-hosted URL did — a renamed shop or a changed `FRONTEND_URL` is
   * reflected the next time this is called, with nothing to update.
   */
  GetQrCodeImageUrl: (shopName: string): string => {
    return `${BASE_URL}/shops/name/${encodeURIComponent(shopName)}/qr-code.png`;
  },
};
