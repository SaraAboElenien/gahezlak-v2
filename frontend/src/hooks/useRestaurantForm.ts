import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import {
  shopSchema,
  type ShopFormData,
} from "@/types/validations/user/shop.schema";
import toast from "react-hot-toast";
import type { UserProfile } from "@/types/user";
import { shopApi } from "@/services/shopApi";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";

interface UseRestaurantFormReturn {
  form: ReturnType<typeof useForm<ShopFormData>>;
  onSubmit: (data: ShopFormData) => Promise<void>;
  isSubmitting: boolean;
  submitError: string | null;
}

export const useRestaurantForm = (
  userData: UserProfile | null | undefined,
  onSuccess?: () => void,
  refetch?: () => void,
): UseRestaurantFormReturn => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { t } = useTranslation();

  const form = useForm<ShopFormData>({
    resolver: zodResolver(shopSchema),
    defaultValues: {
      name: "",
      type: "",
      email: "",
      logo: undefined,
      phoneNumber: "",
      address: {
        country: "",
        city: "",
        street: "",
      },
    },
  });

  // Reset form when initial data changes
  useEffect(() => {
    if (userData) {
      form.reset({
        name: userData.shop?.name || "",
        type: userData.shop?.type || "",
        email: userData.shop?.email || "",
        phoneNumber: userData.shop?.phoneNumber || "",
        logo: userData.shop?.logoUrl || undefined,
        address: {
          country: userData.shop?.address?.country || "",
          city: userData.shop?.address?.city || "",
          street: userData.shop?.address?.street || "",
        },
      });
    }
  }, [userData, form]);

  const onSubmit = async (data: ShopFormData) => {
    try {
      setIsSubmitting(true);
      setSubmitError(null);

      if (!userData?.shop?._id) {
        throw new Error(t("settings.toast.error.invalidData"));
      }

      const formData = new FormData();
      formData.append("name", data.name);
      formData.append("type", data.type);
      formData.append("email", data.email);
      formData.append("phoneNumber", data.phoneNumber);
      formData.append("address[country]", data.address.country);
      formData.append("address[city]", data.address.city);
      formData.append("address[street]", data.address.street);
      if (data.logo && data.logo instanceof FileList && data.logo.length > 0) {
        // Add the file
        formData.append("logo", data.logo[0]);
      }
      await shopApi.UpdateShop(userData.shop._id, formData);

      // No QR regeneration call needed here any more: the QR image is
      // rendered on demand from the shop's current name (see
      // RestaurantSettings.tsx / shopApi.GetQrCodeImageUrl), so a rename
      // saved above is reflected the next time it's fetched, with nothing to
      // trigger explicitly.

      // Call success callback
      onSuccess?.();
      toast.success(t("settings.toast.success.restaurantUpdated"));
      if (refetch) {
        await refetch();
      }
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
      toast.error(t("settings.toast.error.restaurantUpdateFailed"));
      console.error("Error updating restaurant:", err);
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
