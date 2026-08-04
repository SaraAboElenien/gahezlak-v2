// src/hooks/useAuth.ts
import { useMutation } from "@tanstack/react-query";
import { authApi } from "@/services/authApi";
import type { RegisterFormDataUser } from "@/types/validations/user/register.schema";
import type { LoginFormData } from "@/types/validations/user/login.schema";
import type {
  ResetPasswordFormData,
  ResetScema,
  VerifyCodeFormData,
} from "@/types/validations/user/Reset.schema";

// Register
export const useRegister = () =>
  useMutation({
    mutationFn: (data: RegisterFormDataUser) => authApi.registerUser(data),
  });

// Login
export const useLogin = () =>
  useMutation({
    mutationFn: (data: LoginFormData) => authApi.login(data),
  });

// Verify Code
export const useVerifyCode = () =>
  useMutation({
    mutationFn: (data: VerifyCodeFormData) => authApi.verifyCode(data),
  });

// Resend Code
export const useResendCode = () =>
  useMutation({
    mutationFn: (data: { email: string }) => authApi.resendCode(data),
  });

// Forgot Password
export const useForgotPassword = () =>
  useMutation({
    mutationFn: (data: ResetPasswordFormData) => authApi.forgotPassword(data),
  });

// Reset Password
export const useResetPassword = () =>
  useMutation({
    mutationFn: (data: ResetScema & { code: string }) =>
      authApi.resetPassword(data),
  });

// Signout
export const useSignout = () =>
  useMutation({
    mutationFn: authApi.signout,
  });
