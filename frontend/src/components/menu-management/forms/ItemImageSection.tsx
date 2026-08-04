import InputField from "@/components/InputField";
import type { MenuItemFormInputs } from "@/types/validations/menu/items";
import { Image, Upload, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { useTranslation } from "react-i18next";

interface ItemImageSectionProps {
  register: UseFormRegister<MenuItemFormInputs>;
  errors: FieldErrors<MenuItemFormInputs>;
  isLoading?: boolean;
  imgUrl?: string | null;
  isOcr?: boolean;
}

const ItemImageSection: React.FC<ItemImageSectionProps> = ({
  register,
  errors,
  isLoading = false,
  imgUrl,
  isOcr = false,
}) => {
  const { t } = useTranslation();
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  useEffect(() => {
    if (imgUrl) {
      setPreviewImage(imgUrl);
    } else {
      setPreviewImage(null);
    }
  }, [imgUrl]);

  const handleImageChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreviewImage(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    },
    [],
  );

  const removeImage = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPreviewImage(null);

    const fileInput = document.getElementById("item-image") as HTMLInputElement;
    if (fileInput) {
      fileInput.value = "";
    }
  }, []);

  return (
    <div>
      {isOcr ? (
        <InputField
          label={t("menu.items.form.image", "Item Image")}
          id="item-img"
          register={register("image")}
          type="file"
          accept="image/*"
          icon={<Image className="text-gray-700 w-4 h-4" />}
          error={errors.image}
          errorMessage={errors.image?.message}
        />
      ) : (
        <>
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="item-image"
          >
            {t("menu.items.form.image", "Item Image")}
          </label>
          <label htmlFor="item-image" className="cursor-pointer">
            <div className="border-2 border-dashed rounded-lg p-4 text-center relative mt-2 group hover:border-primary transition-colors">
              {previewImage ? (
                <div className="relative">
                  <img
                    src={previewImage}
                    alt="Preview"
                    className="h-40 mx-auto rounded-lg object-cover"
                  />
                  <button
                    type="button"
                    onClick={removeImage}
                    className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-1 hover:bg-destructive/80 z-3 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-foreground mx-auto mb-2 group-hover:text-primary" />
                  <p className="text-sm text-foreground group-hover:text-primary">
                    {t("menu.items.form.uploadImage", "Click to upload image")}
                  </p>
                </>
              )}
              <div className="w-full">
                <input
                  id="image"
                  type="file"
                  disabled={isLoading}
                  {...register("image")}
                  onChange={handleImageChange}
                  accept="image/*"
                  className="input input-bordered absolute top-0 left-0 h-full w-full opacity-0 cursor-pointer z-0
                 "
                />
                {errors.image && (
                  <span className="text-red-500 text-sm block h-3 mt-1">
                    {errors.image?.message}
                  </span>
                )}
              </div>
            </div>
          </label>
          <p className="text-xs text-muted-foreground mt-1">
            {t("menu.items.form.imageHint", "Recommended size: 500x500px")}
          </p>
        </>
      )}
    </div>
  );
};

export default ItemImageSection;
