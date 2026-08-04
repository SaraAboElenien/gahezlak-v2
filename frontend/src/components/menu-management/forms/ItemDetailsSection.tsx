import { useTranslation } from "react-i18next";
import { type UseFormRegister, type FieldErrors } from "react-hook-form";
import InputField from "@/components/InputField";
import getLocalizedText from "@/utils/getLocalizedText";
import type { MenuItemFormInputs } from "@/types/validations/menu/items";
import type { Category } from "@/types/category";
import { useLang } from "@/hooks/useLang";
import ItemImageSection from "./ItemImageSection";

interface ItemDetailsSectionProps {
  register: UseFormRegister<MenuItemFormInputs>;
  errors: FieldErrors<MenuItemFormInputs>;
  categories: Category[];
  isLoading?: boolean;
  isOcr?: boolean;
  imgUrl?: string;
}

const ItemDetailsSection: React.FC<ItemDetailsSectionProps> = ({
  register,
  errors,
  categories,
  isLoading = false,
  isOcr = false,
  imgUrl = "",
}) => {
  const { t } = useTranslation();
  const { currentLang } = useLang();

  return (
    <div className="card-background p-6 rounded-xl border border-border shadow-sm">
      <h3 className="text-lg font-semibold text-primary mb-4 flex items-center gap-2">
        <div className="w-1 h-6 bg-accent rounded-full"></div>
        {t("menu.items.form.detailsSection", "Item Details")}
      </h3>
      <div className="space-y-4">
        {/* Price */}
        <InputField
          label={t("menu.items.form.price")}
          id="price"
          step="0.01"
          min="0.01"
          register={register("price", { valueAsNumber: true })}
          placeholder={t("menu.items.form.pricePlaceholder")}
          error={errors.price}
          errorMessage={errors.price?.message}
        />

        {/* categories input */}
        <div>
          <label
            htmlFor="categoryId"
            className="block text-sm font-medium text-foreground mb-2"
          >
            {t("menu.items.form.category")}
          </label>
          <select
            id="categoryId"
            {...register("categoryId")}
            defaultValue=""
            className="w-full px-4 py-3 border border-input rounded-lg bg-background text-foreground 
                      focus:ring-2 focus:ring-primary focus:border-primary 
                      transition-all duration-200 hover:border-primary/60 shadow-sm"
            disabled={isLoading}
          >
            <option value="">{t("menu.items.form.selectCategory")}</option>
            {categories.map((category) => (
              <option key={category._id} value={category._id}>
                {getLocalizedText(category.name, currentLang)}
              </option>
            ))}
          </select>
          {errors.categoryId && (
            <p className="text-destructive text-sm mt-1">
              {errors.categoryId.message}
            </p>
          )}
        </div>

        {/* image input */}
        <ItemImageSection
          register={register}
          isLoading={isLoading}
          errors={errors}
          imgUrl={isOcr ? null : imgUrl}
          isOcr={isOcr}
        />
      </div>
    </div>
  );
};

export default ItemDetailsSection;
