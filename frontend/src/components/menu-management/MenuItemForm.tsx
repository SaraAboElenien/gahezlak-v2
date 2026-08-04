import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

// Import form sections
import ItemNameSection from "./forms/ItemNameSection";
import ItemDescriptionSection from "./forms/ItemDescriptionSection";
import ItemDetailsSection from "./forms/ItemDetailsSection";
import ItemOptionsSection from "./forms/ItemOptionsSection";
import ItemDiscountSection from "./forms/ItemDiscountSection";
import type { ItemOption, MenuItem } from "@/types/menuItem";
import type { Category } from "@/types/category";
import {
  menuItemSchema,
  type MenuItemFormInputs,
} from "@/types/validations/menu/items";
import AvailabilityToggleSection from "./forms/AvailabilityToggleSection";

interface MenuItemFormProps {
  initialData?: MenuItem | null;
  categories: Category[];
  onSubmit: (data: MenuItemFormInputs, _id?: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
  error?: string | Error;
  isOcr?: boolean;
  onSkip?: () => void;
}

const MenuItemForm: React.FC<MenuItemFormProps> = ({
  initialData,
  categories,
  onSubmit,
  onCancel,
  isLoading = false,
  error,
  isOcr = false,
  onSkip,
}) => {
  const { t } = useTranslation();
  const [options, setOptions] = useState<ItemOption[]>(
    initialData?.options || [],
  );
  const [optionsError, setOptionsError] = useState<string>("");

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<MenuItemFormInputs>({
    resolver: zodResolver(menuItemSchema),
  });

  useEffect(() => {
    if (isOcr) {
      setValue("categoryId", "");
      setValue("image", "");
      // setImgUrl("");
    }
    if (initialData) {
      reset({
        name: initialData.name,
        description: initialData.description,
        price: initialData.price,
        categoryId: initialData.categoryId,
        isAvailable: initialData.isAvailable || true,
        image: initialData.imgUrl || "",
        discountPercentage: initialData.discountPercentage || 0,
        options: initialData.options ? initialData.options : [],
      });
      setOptions(initialData.options || []);
      // setImgUrl(initialData.imgUrl);
    } else {
      reset({
        name: { en: "", ar: "" },
        description: { en: "", ar: "" },
        price: 0,
        categoryId: "",
        isAvailable: true,
        image: "",
        discountPercentage: 0,
      });
      setOptions([]);
    }
  }, [initialData, reset, isOcr, setValue]);

  const handleFormSubmit = (data: MenuItemFormInputs) => {
    const emptyOptions = options.filter((opt) => opt.choices.length === 0);
    console.log(options);
    if (emptyOptions.length > 0) {
      console.log("object");
      setOptionsError(t("menu.items.form.optionsNeedChoices"));
      return;
    }
    if (initialData?._id) {
      onSubmit(data, initialData?._id);
    } else {
      onSubmit(data);
    }
  };

  return (
    <div className="min-h-full rounded-lg">
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6 p-2">
        {/* Name Section */}
        <ItemNameSection
          register={register}
          errors={errors}
          isLoading={isLoading}
        />

        {/* Description Section */}
        <ItemDescriptionSection
          register={register}
          errors={errors}
          isLoading={isLoading}
        />

        <AvailabilityToggleSection
          isAvailable={watch("isAvailable")}
          onChange={(checked) => {
            setValue("isAvailable", checked);
          }}
          isLoading={isLoading}
        />

        {/* Details Section */}
        <ItemDetailsSection
          register={register}
          errors={errors}
          categories={categories}
          isLoading={isLoading}
          imgUrl={initialData?.imgUrl}
          isOcr={isOcr}
        />

        {/* Options Section */}
        <ItemOptionsSection
          register={register}
          errors={errors}
          options={options}
          setOptions={setOptions}
          isLoading={isLoading}
        />

        {/* Discount Section */}
        <ItemDiscountSection
          register={register}
          errors={errors}
          watch={watch}
          isLoading={isLoading}
        />

        {/* errors section */}
        {error && (
          <div className="p-3 text-md text-center text-red-600 bg-red-50 rounded-md dark:bg-red-900/20 dark:text-red-400">
            {typeof error === "string" ? error : error.message}
          </div>
        )}
        {optionsError && (
          <div className="p-3 text-md text-center text-yellow-600 bg-yellow-50 rounded-md">
            {optionsError}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-6 border-t border-border">
          <button
            type="button"
            onClick={isOcr ? onSkip : onCancel}
            className="px-6 py-3 border border-border text-foreground rounded-lg 
                      hover:bg-muted transition-all duration-200 font-medium
                      focus:ring-2 focus:ring-ring focus:outline-none
                      disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            disabled={isLoading}
          >
            {isOcr ? "Skip" : t("menu.items.form.cancel")}
          </button>
          <button
            type="submit"
            className="flex items-center gap-2 bg-primary hover:bg-darker-primary 
                      text-primary-foreground px-8 py-3 rounded-lg font-medium 
                      transition-all duration-200 hover:shadow-lg 
                      transform hover:-translate-y-0.5 focus:ring-2 focus:ring-ring 
                      focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed
                      disabled:hover:transform-none disabled:hover:shadow-none cursor-pointer"
            disabled={isLoading || isSubmitting}
          >
            {isLoading || isSubmitting ? (
              <span className="flex items-center">
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-primary-foreground"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                {t("menu.items.form.saving")}
              </span>
            ) : initialData?._id ? (
              t("menu.items.form.update")
            ) : (
              t("menu.items.form.add")
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default MenuItemForm;
