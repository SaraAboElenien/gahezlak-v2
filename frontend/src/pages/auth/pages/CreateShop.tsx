import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { Mail, User, Store, Phone, Image } from "lucide-react";
import InputField from "../../../components/InputField";
import {
  shopSchema,
  type ShopFormData,
} from "@/types/validations/user/shop.schema";
import { useShop } from "@/hooks/useShop";
import { useTranslation } from "react-i18next";
import { useProfile } from "@/hooks/useProfile";
import { AxiosError } from "axios";

export default function CreateShop() {
  const { refreshProfile } = useProfile();
  const { mutate: CreateShop, isPending } = useShop();
  const nav = useNavigate();
  const { t } = useTranslation();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ShopFormData>({
    resolver: zodResolver(shopSchema),
  });

  const onSubmit = async (data: ShopFormData) => {
    try {
      CreateShop(data, {
        onSuccess: (res) => {
          console.log("Shop Created", res.data);
          toast.success(
            "Shop created successfully! Redirecting to subscription...",
          );
          refreshProfile();
          // Navigate to subscription form
          nav("/auth/subscribe");
        },
        onError: (err: unknown) => {
          console.error(`Shop Creation Error  ${err}`);
          const message =
            err instanceof AxiosError ? err.response?.data?.message : undefined;
          toast.error(
            `Shop creation failed ${message || t("common.errors.generic")}.`,
          );
        },
      });
    } catch (error) {
      console.error("Shop Creation Error", error);
      toast.error("Something went wrong. Please try again.");
    }
  };

  return (
    <div className="w-full max-w-7xl">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-4xl font-semibold mb-2">{t("createShopTitle")}</h2>
        <p className="mb-6 text-lg">{t("createShopDescription")}</p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <InputField
            label={t("shopName")}
            id="name"
            placeholder={t("shopNamePlaceholder")}
            icon={<Store className="text-gray-700 w-4 h-4" />}
            register={register("name")}
            error={errors.name}
            errorMessage={errors.name?.message}
          />

          <InputField
            label={t("shopType")}
            id="type"
            placeholder={t("shopTypePlaceholder")}
            icon={<Store className="text-gray-700 w-4 h-4" />}
            register={register("type")}
            error={errors.type}
            errorMessage={errors.type?.message}
          />

          <InputField
            label={t("country")}
            id="address.country"
            placeholder={t("countryPlaceholder")}
            icon={<User className="text-gray-700 w-4 h-4" />}
            register={register("address.country")}
            error={errors.address?.country}
            errorMessage={errors.address?.country?.message}
          />

          <InputField
            label={t("city")}
            id="address.city"
            placeholder={t("cityPlaceholder")}
            icon={<User className="text-gray-700 w-4 h-4" />}
            register={register("address.city")}
            error={errors.address?.city}
            errorMessage={errors.address?.city?.message}
          />

          <InputField
            label={t("street")}
            id="address.street"
            placeholder={t("streetPlaceholder")}
            icon={<User className="text-gray-700 w-4 h-4" />}
            register={register("address.street")}
            error={errors.address?.street}
            errorMessage={errors.address?.street?.message}
          />

          <InputField
            label={t("phoneNumber")}
            id="phoneNumber"
            placeholder={t("phoneNumberPlaceholder")}
            icon={<Phone className="text-gray-700 w-4 h-4" />}
            register={register("phoneNumber")}
            error={errors.phoneNumber}
            errorMessage={errors.phoneNumber?.message}
          />

          <InputField
            label={t("email")}
            id="email"
            type="email"
            placeholder={t("emailPlaceholder")}
            icon={<Mail className="text-gray-700 w-4 h-4" />}
            register={register("email")}
            error={errors.email}
            errorMessage={errors.email?.message}
          />

          {/* Logo Upload */}
          <InputField
            label="Shop Logo"
            id="logoUrl"
            type="file"
            accept="image/*"
            icon={<Image className="text-gray-700 w-4 h-4" />}
            register={register("logoUrl")}
            error={errors.logoUrl}
            errorMessage={errors.logoUrl?.message}
          />

          <div>
            <button
              type="submit"
              className="btn btn-gradient border-0 text-white w-full"
              disabled={isPending}
            >
              {isPending ? t("creatingShop") : t("createShopButton")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
