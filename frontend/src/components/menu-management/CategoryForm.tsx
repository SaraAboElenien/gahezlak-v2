import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import InputField from "@/components/InputField";
import type { Category } from "@/types/category";
import {
  categorySchema,
  type CategoryFormInputs,
} from "@/types/validations/menu/category";

interface CategoryFormProps {
  initialData?: Category | null;
  onSubmit: (data: CategoryFormInputs, _id?: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
  error?: string | Error;
  isOcr?: boolean;
  onSkip?: () => void;
}

const CategoryForm: React.FC<CategoryFormProps> = ({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
  error,
  isOcr,
  onSkip,
}) => {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormInputs>({
    resolver: zodResolver(categorySchema),
  });

  useEffect(() => {
    if (initialData) {
      reset({
        name: { en: initialData.name.en, ar: initialData.name.ar },
        description: {
          en: initialData.description?.en,
          ar: initialData.description?.ar,
        },
      });
    } else {
      reset({
        name: { en: "", ar: "" },
        description: { en: "", ar: "" },
      });
    }
  }, [initialData, reset]);

  const handleFormSubmit = (data: CategoryFormInputs) => {
    const submitData: CategoryFormInputs = {
      name: data.name,
      description: {
        en: data.description?.en || "",
        ar: data.description?.ar || "",
      },
    };
    if (initialData?._id) {
      onSubmit(submitData, initialData?._id);
    } else {
      onSubmit(submitData);
    }
  };

  return (
    <div className="min-h-full rounded-lg">
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6 p-2">
        {/* Name Fields Section */}
        <div className="card-background p-6 rounded-xl border border-border shadow-sm">
          <h3 className="text-lg font-semibold text-primary mb-4 flex items-center gap-2">
            <div className="w-1 h-6 bg-primary rounded-full"></div>
            {t("menu.categories.form.nameSection", "Category Name")}
          </h3>
          <div className="space-y-4">
            <InputField
              label={t("menu.categories.form.nameEn")}
              id="name-en"
              type="text"
              register={register("name.en")}
              placeholder={t("menu.categories.form.nameEnPlaceholder")}
              error={errors.name?.en}
              errorMessage={errors.name?.en?.message}
            />

            <InputField
              label={t("menu.categories.form.nameAr")}
              id="name-ar"
              type="text"
              register={register("name.ar")}
              placeholder={t("menu.categories.form.nameArPlaceholder")}
              error={errors.name?.ar}
              errorMessage={errors.name?.ar?.message}
            />
          </div>
        </div>

        {/* Description Fields Section */}
        <div className="card-background p-6 rounded-xl border border-border shadow-sm">
          <h3 className="text-lg font-semibold text-primary mb-4 flex items-center gap-2">
            <div className="w-1 h-6 bg-secondary rounded-full"></div>
            {t("menu.categories.form.descriptionSection")}
          </h3>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="description-en"
                className="block text-sm font-medium text-foreground mb-2"
              >
                {t("menu.categories.form.descriptionEn")}
              </label>
              <textarea
                id="description-en"
                {...register("description.en")}
                rows={3}
                className="w-full px-4 py-3 border border-input rounded-lg bg-background text-foreground 
                          focus:ring-2 focus:ring-primary focus:border-primary 
                          transition-all duration-200 resize-none
                          hover:border-primary/60 shadow-sm"
                placeholder={t("menu.categories.form.descriptionEnPlaceholder")}
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
                {t("menu.categories.form.descriptionAr")}
              </label>
              <textarea
                id="description-ar"
                {...register("description.ar")}
                rows={3}
                className="w-full px-4 py-3 border border-input rounded-lg bg-background text-foreground 
                          focus:ring-2 focus:ring-primary focus:border-primary 
                          transition-all duration-200 resize-none
                          hover:border-primary/60 shadow-sm"
                placeholder={t("menu.categories.form.descriptionArPlaceholder")}
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

        {/* errors section */}
        {error && (
          <div className="p-3 text-md text-center text-red-600 bg-red-50 rounded-md dark:bg-red-900/20 dark:text-red-400">
            {typeof error === "string" ? error : error.message}
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
            {isOcr ? "Skip" : t("menu.categories.form.cancel")}
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
                {t("menu.categories.form.saving")}
              </span>
            ) : initialData?._id ? (
              t("menu.categories.form.update")
            ) : (
              t("menu.categories.form.add")
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CategoryForm;
