import type { MutateOcrResponse } from "@/types/menuOcr";
import { axiosInstance } from "./axiosInint";

export const menuOCRApi = {
  CreateMenuUsingOCR: (data: FormData): Promise<MutateOcrResponse> => {
    const isFormData = data instanceof FormData;
    const config = {
      headers: {
        "Content-Type": isFormData ? "multipart/form-data" : "application/json",
      },
    };
    return axiosInstance
      .post("/ai/menu/vision-extract", data, config)
      .then((res) => res.data);
  },
};
