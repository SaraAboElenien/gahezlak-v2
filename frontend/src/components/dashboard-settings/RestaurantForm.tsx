import { useTranslation } from "react-i18next";
import { Store, Mail, Phone, Building, Image } from "lucide-react";
import type { ShopFormData } from "@/types/validations/user/shop.schema";
import type { UseFormReturn } from "react-hook-form";
import InputField from "../InputField";
import { AddressSection } from "./AddressSection";
import { useEffect, useRef } from "react";
import toast from "react-hot-toast";

interface RestaurantFormProps {
  form: UseFormReturn<ShopFormData>;
  isEditing: boolean;
  onSubmit: (data: ShopFormData) => void;
  qrImg?: string;
}

export const RestaurantForm = ({
  form,
  isEditing,
  onSubmit,
  qrImg,
}: RestaurantFormProps) => {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = form;

  const logo = watch("logo");
  const existingLogo = typeof logo === "string" ? logo : null;
  const objectUrlRef = useRef<string | null>(null);

  // Cleanup object URL when component unmounts or logo changes
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  // Create object URL for preview
  const getPreviewUrl = () => {
    if (logo && logo instanceof FileList && logo.length > 0) {
      // Cleanup previous object URL
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      // Create new object URL
      objectUrlRef.current = URL.createObjectURL(logo[0]);
      return objectUrlRef.current;
    }
    return null;
  };

  const previewUrl = getPreviewUrl();
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      <div className="">
        {/* Basic Information */}
        <div className="">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center">
            {t("settings.sectionTitles.basicInfo")}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* name */}
            <InputField
              label={t("settings.restaurantInfo.name")}
              id="restaurant-name"
              icon={<Store className="text-gray-700 w-4 h-4" />}
              placeholder={t("settings.placeholders.name")}
              register={register("name")}
              error={errors.name}
              errorMessage={errors.name?.message}
              disabled={!isEditing}
            />

            {/* type */}
            <InputField
              label={t("settings.restaurantInfo.type")}
              id="restaurant-type"
              icon={<Building className="text-gray-700 w-4 h-4" />}
              placeholder={t("settings.placeholders.type")}
              register={register("type")}
              error={errors.type}
              errorMessage={errors.type?.message}
              disabled={!isEditing}
            />

            {/* logo */}
            <div className="flex flex-col justify-between">
              <div>
                <label className="label text-gray-900 dark:text-white">
                  {t("settings.restaurantInfo.logo")}
                </label>
                {/* Show current logo if exists */}
                <div className="h-full text-center flex items-center justify-center">
                  {existingLogo && (
                    <div className="mt-9 h-full">
                      <img
                        src={existingLogo}
                        alt="Current logo"
                        className="h-25 w-25 object-cover rounded-full border border-gray-200"
                      />
                    </div>
                  )}
                  {/* Preview new image if selected */}
                  {previewUrl && (
                    <div className="mt-2 h-full">
                      <img
                        src={previewUrl}
                        alt="New logo preview"
                        className="h-25 w-25 object-cover rounded-full border border-gray-200"
                      />
                    </div>
                  )}
                </div>
              </div>
              {/* File input */}
              <InputField
                label=""
                id="logo"
                type="file"
                accept="image/*"
                icon={<Image className="text-gray-700 w-4 h-4" />}
                register={register("logo")}
                error={errors.logo}
                errorMessage={errors.logo?.message}
                disabled={!isEditing}
              />
            </div>

            <div>
              <div className="w-full">
                <p className="label text-gray-900">QR Code</p>
                <div className="">
                  <img
                    src={qrImg}
                    alt=""
                    className="max-h-50 w-[50%] mx-auto object-contain"
                  />
                  {qrImg && (
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.preventDefault();
                        try {
                          // First fetch the image
                          const response = await fetch(qrImg);
                          const blob = await response.blob();

                          // Create download link
                          const url = window.URL.createObjectURL(blob);
                          const link = document.createElement("a");
                          link.href = url;
                          link.download = `qr-code-${
                            form.getValues("name") || "restaurant"
                          }.png`;

                          // Trigger download
                          document.body.appendChild(link);
                          link.click();

                          // Cleanup
                          setTimeout(() => {
                            document.body.removeChild(link);
                            window.URL.revokeObjectURL(url);
                          }, 100);

                          toast.success("QR code downloaded successfully!");
                        } catch (error) {
                          console.error("Download failed:", error);
                          toast.error("Failed to download QR code");
                        }
                      }}
                      className="mt-4 ms-auto flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-darker-primary transition-colors cursor-pointer"
                    >
                      Download QR Code
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Contact Information */}
        <div className="my-10">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center">
            {t("settings.sectionTitles.contactInfo")}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InputField
              label={t("settings.restaurantInfo.email")}
              id="restaurant-email"
              type="email"
              icon={<Mail className="text-gray-700 w-4 h-4" />}
              placeholder={t("settings.placeholders.email")}
              register={register("email")}
              error={errors.email}
              errorMessage={errors.email?.message}
              disabled={!isEditing}
            />

            <InputField
              label={t("settings.restaurantInfo.phone")}
              id="restaurant-phone"
              type="tel"
              icon={<Phone className="text-gray-700 w-4 h-4" />}
              placeholder={t("settings.placeholders.phone")}
              register={register("phoneNumber")}
              error={errors.phoneNumber}
              errorMessage={errors.phoneNumber?.message}
              disabled={!isEditing}
            />
          </div>
        </div>

        {/* Address Information */}
        <AddressSection form={form} isEditing={isEditing} />
      </div>
    </form>
  );
};
