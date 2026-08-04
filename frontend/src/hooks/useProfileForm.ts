import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import {
  ownerProfileSchema,
  type OwnerProfileFormData,
} from "@/types/validations/user/shop.schema";
import toast from "react-hot-toast";
import type { UserProfile } from "@/types/user";
import { userApi } from "@/services/userApi";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";

interface UseRestaurantFormReturn {
  form: ReturnType<typeof useForm<OwnerProfileFormData>>;
  onSubmit: (data: OwnerProfileFormData) => Promise<void>;
  isSubmitting: boolean;
  submitError: string | null;
}

export const useProfileForm = (
  userData: UserProfile | null,
  onSuccess?: () => void,
): UseRestaurantFormReturn => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { t } = useTranslation();

  const form = useForm<OwnerProfileFormData>({
    resolver: zodResolver(ownerProfileSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      phoneNumber: "",
    },
  });

  useEffect(() => {
    if (userData) {
      form.reset({
        firstName: userData.firstName || "",
        lastName: userData.lastName || "",
        phoneNumber: userData.phoneNumber || "",
      });
    }
  }, [userData, form]);

  const onSubmit = async (data: OwnerProfileFormData) => {
    try {
      setIsSubmitting(true);
      setSubmitError(null);
      await userApi.UpdateUser(data);
      // Call success callback
      onSuccess?.();
      toast.success(t("settings.toast.success.profileUpdated"));
    } catch (err) {
      if (err instanceof AxiosError) {
        setSubmitError(
          err.response?.data?.message || t("common.errors.generic"),
        );
      } else if (err instanceof Error) {
        setSubmitError(err.message);
      } else {
        setSubmitError(t("common.errors.generic"));
      }
      toast.error(t("settings.toast.error.profileUpdateFailed"));
      console.error("Error updating Profile:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    form,
    onSubmit,
    isSubmitting,
    submitError,
  };
};
