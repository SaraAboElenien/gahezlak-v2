import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import { Mail, User, Phone, Lock } from "lucide-react";
import InputField from "../../../components/InputField";
import {
  registerSchema,
  type RegisterFormData,
} from "@/types/validations/user/register.schema";
import type { RegisterFormDataUser } from "@/types/validations/user/register.schema";
import { useRegister } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";

// Extracts a backend error message from a caught error of unknown shape
// without assuming it's a real AxiosError instance (network-level failures
// and test doubles may only be axios-error-*shaped*, not real instances).
function getApiErrorMessage(err: unknown): string | undefined {
  if (err && typeof err === "object" && "response" in err) {
    const response = (err as { response?: { data?: { message?: string } } })
      .response;
    return response?.data?.message;
  }
  return undefined;
}

export default function Register() {
  const { mutate: registerUser, isPending } = useRegister();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const nav = useNavigate();
  const { t } = useTranslation();

  const onSubmit = async (data: RegisterFormData) => {
    const userData: RegisterFormDataUser = {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phoneNumber: data.phoneNumber,
      password: data.password,
      confirmPassword: data.confirmPassword,
    };
    try {
      registerUser(userData, {
        onSuccess: () => {
          sessionStorage.setItem("resetEmail", userData.email);
          toast.success("Please Check Your Email For The Verification Code !");
          setTimeout(() => nav("/auth/verify"), 1000);
        },
        onError: (err: unknown) => {
          const message = getApiErrorMessage(err) || t("common.errors.generic");
          console.error("Register Error", message);
          toast.error(`Register failed ${message}.`);
        },
      });
    } catch {
      toast.error("some thing wrong happend. Please try again.");
    }
  };

  return (
    <div className="w-full max-w-7xl">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-4xl font-semibold mb-2">
          {t("registeration.title")}
        </h2>
        <p className="mb-6 text-lg">{t("registeration.subtitle")}</p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <InputField
            label={t("registeration.firstName")}
            id="firstName"
            placeholder={t("registeration.firstNamePlaceholder")}
            icon={<User className="text-gray-700 w-4 h-4" />}
            register={register("firstName")}
            error={errors.firstName}
            errorMessage={errors.firstName?.message}
          />

          <InputField
            label={t("registeration.lastName")}
            id="lastName"
            placeholder={t("registeration.lastNamePlaceholder")}
            icon={<User className="text-gray-700 w-4 h-4" />}
            register={register("lastName")}
            error={errors.lastName}
            errorMessage={errors.lastName?.message}
          />

          <InputField
            label={t("registeration.email")}
            id="email"
            type="email"
            placeholder={t("registeration.emailPlaceholder")}
            icon={<Mail className="text-gray-700 w-4 h-4" />}
            register={register("email")}
            error={errors.email}
            errorMessage={errors.email?.message}
          />

          <InputField
            label={t("registeration.phone")}
            id="phone"
            placeholder={t("registeration.phonePlaceholder")}
            icon={<Phone className="text-gray-700 w-4 h-4" />}
            register={register("phoneNumber")}
            error={errors.phoneNumber}
            errorMessage={errors.phoneNumber?.message}
          />

          <InputField
            label={t("registeration.password")}
            id="password"
            type="password"
            placeholder={t("registeration.passwordPlaceholder")}
            icon={<Lock className="text-gray-700 w-4 h-4" />}
            register={register("password")}
            error={errors.password}
            errorMessage={errors.password?.message}
          />

          <InputField
            label={t("registeration.confirmPassword")}
            id="confirmPassword"
            type="password"
            placeholder={t("registeration.confirmPasswordPlaceholder")}
            icon={<Lock className="text-gray-700 w-4 h-4" />}
            register={register("confirmPassword")}
            error={errors.confirmPassword}
            errorMessage={errors.confirmPassword?.message}
          />

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="terms"
              className="checkbox checkbox-sm mt-1 checked:bg-gray-100 p-1"
              {...register("terms")}
            />
            <label htmlFor="terms" className="text-sm">
              {t("registeration.terms")}
            </label>
          </div>
          {errors.terms && (
            <span className="text-red-500 text-sm block h-3 mt-1">
              {errors.terms.message}
            </span>
          )}

          <div>
            <button
              type="submit"
              className="btn btn-gradient border-0 text-white w-full"
              disabled={isPending}
            >
              {isPending
                ? t("registeration.submitting")
                : t("registeration.submit")}
            </button>
          </div>

          <p className="text-sm text-center mt-4">
            {t("registeration.haveAccount")}{" "}
            <Link
              to="/auth"
              className="link link-hover text-primary hover:text-lighter-primary ms-2"
            >
              {t("registeration.login")}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
