import type { OwnerProfileFormData } from "@/types/validations/user/shop.schema";
import InputField from "../InputField";
import type { UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Phone, User } from "lucide-react";

interface RestaurantFormProps {
  form: UseFormReturn<OwnerProfileFormData>;
  isEditing: boolean;
  onSubmit: (data: OwnerProfileFormData) => void;
}

export default function OwnerForm({
  form,
  isEditing,
  onSubmit,
}: RestaurantFormProps) {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InputField
          label={t("settings.owner.firstName")}
          id="owner-firstName"
          icon={<User className="text-gray-700 w-4 h-4" />}
          placeholder="Enter your first name"
          register={register("firstName")}
          error={errors.firstName}
          errorMessage={errors.firstName?.message}
          disabled={!isEditing}
        />
        <InputField
          label={t("settings.owner.lastName")}
          id="owner-lastname"
          icon={<User className="text-gray-700 w-4 h-4" />}
          placeholder="Enter your last name"
          register={register("lastName")}
          error={errors.lastName}
          errorMessage={errors.lastName?.message}
          disabled={!isEditing}
        />
        <InputField
          label={t("settings.owner.phoneNumber")}
          id="owner-number"
          icon={<Phone className="text-gray-700 w-4 h-4" />}
          placeholder="Enter phone number"
          register={register("phoneNumber")}
          error={errors.phoneNumber}
          errorMessage={errors.phoneNumber?.message}
          disabled={!isEditing}
        />
      </div>
    </form>
  );
}
