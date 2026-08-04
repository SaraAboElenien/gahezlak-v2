import React from "react";
import { useTranslation } from "react-i18next";
import { type UseFormRegister, type FieldErrors } from "react-hook-form";
import InputField from "@/components/InputField";
import type { MenuItemFormInputs } from "@/types/validations/menu/items";

interface ItemNameSectionProps {
  register: UseFormRegister<MenuItemFormInputs>;
  errors: FieldErrors<MenuItemFormInputs>;
  isLoading?: boolean;
}

const ItemNameSection: React.FC<ItemNameSectionProps> = ({
  register,
  errors,
  isLoading = false,
}) => {
  const { t } = useTranslation();

  return (
    <div className="card-background p-6 rounded-xl border border-border shadow-sm">
      <h3 className="text-lg font-semibold text-primary mb-4 flex items-center gap-2">
        <div className="w-1 h-6 bg-primary rounded-full"></div>
        {t("menu.items.form.nameSection", "Item Name")}
      </h3>
      <div className="space-y-4">
        <InputField
          label={t("menu.items.form.nameEn")}
          id="name-en"
          type="text"
          register={register("name.en")}
          placeholder={t("menu.items.form.nameEnPlaceholder")}
          error={errors.name?.en}
          errorMessage={errors.name?.en?.message}
          disabled={isLoading}
        />

        <InputField
          label={t("menu.items.form.nameAr")}
          id="name-ar"
          type="text"
          register={register("name.ar")}
          placeholder={t("menu.items.form.nameArPlaceholder")}
          error={errors.name?.ar}
          errorMessage={errors.name?.ar?.message}
          disabled={isLoading}
        />
      </div>
    </div>
  );
};

export default ItemNameSection;
