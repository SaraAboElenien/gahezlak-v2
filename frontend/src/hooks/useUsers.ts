import { userApi } from "@/services/userApi";
import { useMutation } from "@tanstack/react-query";

export const useCodeRequest = () =>
  useMutation({
    mutationFn: (data: { newEmail: string }) => userApi.ChangeMailRequest(data),
  });

// Verify Code
export const useChangeMailCode = () =>
  useMutation({
    mutationFn: (data: { code: string }) => userApi.ChangeMailConfirm(data),
  });

export const useChangePassword = () =>
  useMutation({
    mutationFn: (data: { oldPassword: string; newPassword: string }) =>
      userApi.ChangePassword(data),
  });
