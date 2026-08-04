import React from "react";
import { useTranslation } from "react-i18next";
import {
  type UseFormRegister,
  type FieldErrors,
  type UseFormWatch,
} from "react-hook-form";
import InputField from "@/components/InputField";
import type { MenuItemFormInputs } from "@/types/validations/menu/items";

interface ItemDiscountSectionProps {
  register: UseFormRegister<MenuItemFormInputs>;
  errors: FieldErrors<MenuItemFormInputs>;
  watch: UseFormWatch<MenuItemFormInputs>;
  isLoading?: boolean;
}

const ItemDiscountSection: React.FC<ItemDiscountSectionProps> = ({
  register,
  errors,
  isLoading = false,
}) => {
  const { t } = useTranslation();

  return (
    <div className="card-background p-6 rounded-xl border border-border shadow-sm">
      <h3 className="text-lg font-semibold text-primary mb-4 flex items-center gap-2">
        <div className="w-1 h-6 bg-muted-foreground rounded-full"></div>
        {t("menu.items.form.discountSection", "Discount Settings")}
      </h3>
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <InputField
            label={t("menu.items.form.discountPercentage")}
            id="discount-value"
            step="0.01"
            min="0"
            register={register("discountPercentage", { valueAsNumber: true })}
            placeholder={t("menu.items.form.discountValuePlaceholder")}
            error={errors.discountPercentage}
            errorMessage={errors.discountPercentage?.message}
            disabled={isLoading}
          />
        </div>
      </div>
    </div>
  );
};

export default ItemDiscountSection;
