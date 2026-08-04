import React from "react";
import { useTranslation } from "react-i18next";
import { type UseFormRegister, type FieldErrors } from "react-hook-form";
import type { MenuItemFormInputs } from "@/types/validations/menu/items";

interface ItemDescriptionSectionProps {
  register: UseFormRegister<MenuItemFormInputs>;
  errors: FieldErrors<MenuItemFormInputs>;
  isLoading?: boolean;
}

const ItemDescriptionSection: React.FC<ItemDescriptionSectionProps> = ({
  register,
  errors,
  isLoading = false,
}) => {
  const { t } = useTranslation();

  return (
    <div className="card-background p-6 rounded-xl border border-border shadow-sm">
      <h3 className="text-lg font-semibold text-primary mb-4 flex items-center gap-2">
        <div className="w-1 h-6 bg-secondary rounded-full"></div>
        {t("menu.items.form.descriptionSection", "Item Description")}
      </h3>
      <div className="space-y-4">
        <div>
          <label
            htmlFor="description-en"
            className="block text-sm font-medium text-foreground mb-2"
          >
            {t("menu.items.form.descriptionEn")}
          </label>
          <textarea
            id="description-en"
            {...register("description.en")}
            rows={3}
            className="w-full px-4 py-3 border border-input rounded-lg bg-background text-foreground 
                      focus:ring-2 focus:ring-primary focus:border-primary 
                      transition-all duration-200 resize-none
                      hover:border-primary/60 shadow-sm"
            placeholder={t("menu.items.form.descriptionEnPlaceholder")}
            disabled={isLoading}
          />
          {errors.description?.en && (
            <span className="text-destructive text-sm mt-1 block">
              {errors.description.en.message}
            </span>
          )}
        </div>

        <div>
          <label
            htmlFor="description-ar"
            className="block text-sm font-medium text-foreground mb-2"
          >
            {t("menu.items.form.descriptionAr")}
          </label>
          <textarea
            id="description-ar"
            {...register("description.ar")}
            rows={3}
            className="w-full px-4 py-3 border border-input rounded-lg bg-background text-foreground 
                      focus:ring-2 focus:ring-primary focus:border-primary 
                      transition-all duration-200 resize-none
                      hover:border-primary/60 shadow-sm"
            placeholder={t("menu.items.form.descriptionArPlaceholder")}
            disabled={isLoading}
          />
          {errors.description?.ar && (
            <span className="text-destructive text-sm mt-1 block">
              {errors.description.ar.message}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ItemDescriptionSection;
