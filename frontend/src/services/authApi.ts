import type { LoginFormData } from "@/types/validations/user/login.schema";
import { axiosInstance } from "./axiosInint";
import type { RegisterFormDataUser } from "@/types/validations/user/register.schema";
import type {
  ResetPasswordFormData,
  ResetScema,
  VerifyCodeFormData,
} from "@/types/validations/user/Reset.schema";
import type {
  EmptyDataResponse,
  LoginResponse,
  RefreshTokenResponse,
  VerifyCodeResponse,
} from "@/types/auth";

export const authApi = {
  registerUser: (data: RegisterFormDataUser): Promise<EmptyDataResponse> => {
    return axiosInstance.post("/auth/register", data).then((res) => res.data);
  },

  login: (data: LoginFormData): Promise<LoginResponse> => {
    return axiosInstance.post("/auth/login", data).then((res) => res.data);
  },

  verifyCode: (data: VerifyCodeFormData): Promise<VerifyCodeResponse> => {
    return axiosInstance
      .post("/auth/verify-code", data)
      .then((res) => res.data);
  },

  resendCode: (data: { email: string }): Promise<EmptyDataResponse> => {
    return axiosInstance
      .post("/auth/resend-verification-code", data)
      .then((res) => res.data);
  },

  forgotPassword: (data: ResetPasswordFormData): Promise<EmptyDataResponse> => {
    return axiosInstance
      .post("/auth/forgot-password", data)
      .then((res) => res.data);
  },

  resetPassword: (
    data: ResetScema & { code: string },
  ): Promise<EmptyDataResponse> => {
    return axiosInstance
      .post("/auth/reset-password", data)
      .then((res) => res.data);
  },

  // Takes no payload: the refresh token is sent automatically as the httpOnly
  // cookie. Note that most refreshes go through refreshAccessToken() in
  // axiosInint.ts instead, which dedupes concurrent calls and bypasses the
  // interceptors.
  refresh: (): Promise<RefreshTokenResponse> => {
    return axiosInstance.post("/auth/refresh").then((res) => res.data);
  },

  signout: (): Promise<EmptyDataResponse> => {
    return axiosInstance.post("/auth/signout").then((res) => res.data);
  },
};
