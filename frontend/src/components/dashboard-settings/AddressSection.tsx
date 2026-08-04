import { useTranslation } from "react-i18next";
import { Globe, Building2, Home } from "lucide-react";
import type { ShopFormData } from "@/types/validations/user/shop.schema";
import type { UseFormReturn } from "react-hook-form";
import InputField from "../InputField";

interface AddressSectionProps {
  form: UseFormReturn<ShopFormData>;
  isEditing: boolean;
}

export const AddressSection = ({ form, isEditing }: AddressSectionProps) => {
  const { t } = useTranslation();
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center">
        {t("settings.restaurantInfo.address")}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <InputField
          label={t("settings.restaurantInfo.country")}
          id="restaurant-country"
          icon={<Globe className="text-gray-700 w-4 h-4" />}
          placeholder="United States"
          register={register("address.country")}
          error={errors.address?.country}
          errorMessage={errors.address?.country?.message}
          disabled={!isEditing}
        />

        <InputField
          label={t("settings.restaurantInfo.city")}
          id="restaurant-city"
          icon={<Building2 className="text-gray-700 w-4 h-4" />}
          placeholder="New York"
          register={register("address.city")}
          error={errors.address?.city}
          errorMessage={errors.address?.city?.message}
          disabled={!isEditing}
        />

        <InputField
          label={t("settings.restaurantInfo.street")}
          id="restaurant-street"
          icon={<Home className="text-gray-700 w-4 h-4" />}
          placeholder="123 Main Street"
          register={register("address.street")}
          error={errors.address?.street}
          errorMessage={errors.address?.street?.message}
          disabled={!isEditing}
        />
      </div>
    </div>
  );
};
