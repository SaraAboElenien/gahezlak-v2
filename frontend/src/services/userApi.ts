import type {
  ChangePasswordResponse,
  ConfirmChangeMailResponse,
  RequestChangeMailResponse,
  UpdateProfileResponse,
  UserProfileResponse,
} from "@/types/user";
import { axiosInstance } from "./axiosInint";
import type { OwnerProfileFormData } from "@/types/validations/user/shop.schema";

export const userApi = {
  GetUser: (): Promise<UserProfileResponse> => {
    return axiosInstance.get("/users/profile").then((res) => res.data);
  },
  UpdateUser: (data: OwnerProfileFormData): Promise<UpdateProfileResponse> => {
    return axiosInstance.put("/users/profile", data).then((res) => res.data);
  },
  ChangeMailRequest: (data: {
    newEmail: string;
  }): Promise<RequestChangeMailResponse> => {
    return axiosInstance
      .post("/users/request-email-change", data)
      .then((res) => res.data);
  },
  ChangeMailConfirm: (data: {
    code: string;
  }): Promise<ConfirmChangeMailResponse> => {
    return axiosInstance
      .post("/users/confirm-email-change", data)
      .then((res) => res.data);
  },
  ChangePassword: (data: {
    oldPassword: string;
    newPassword: string;
  }): Promise<ChangePasswordResponse> => {
    return axiosInstance
      .put("/users/change-password", data)
      .then((res) => res.data);
  },
};
