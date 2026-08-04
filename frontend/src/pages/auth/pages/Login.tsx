import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Lock } from "lucide-react";
import InputField from "../../../components/InputField";
import {
  loginSchema,
  type LoginFormData,
} from "@/types/validations/user/login.schema";
import { useLogin } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { useProfile } from "@/hooks/useProfile";
import { AxiosError } from "axios";
import { setAccessToken } from "@/services/axiosInint";

export default function Login() {
  const { mutate: login, isPending } = useLogin();
  const { t } = useTranslation();
  const { refreshProfile } = useProfile();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      login(data, {
        onSuccess: (res) => {
          // Access token is held in memory only; the refresh token arrived as
          // an httpOnly cookie the browser stored for us.
          setAccessToken(res.data.accessToken);
          refreshProfile();
          toast.success("Logged in successfully!");
        },
        onError: (err: unknown) => {
          console.error("Login Error", err);
          const message =
            err instanceof AxiosError ? err.response?.data?.message : undefined;
          toast.error(`Login failed ${message || t("common.errors.generic")}.`);
        },
      });
    } catch (error) {
      console.log(error);
      toast.error("Something went wrong. Please try again.");
    }
  };

  return (
    <div className="w-full">
      <div className="mx-auto bg-transparent dark:text-white max-w-md">
        <div className="mb-4">
          <h2 className="text-3xl font-semibold text-center mb-3">
            {t("welcomeBack")}
          </h2>
          <p className="text-lg text-gray-700">{t("enterEmailToLogin")}</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="flex flex-col items-start gap-6">
            {/* Email */}
            <InputField
              label={t("email")}
              id="email"
              type="email"
              placeholder={t("emailPlaceholder")}
              icon={<Mail className="text-gray-700 w-4 h-4" />}
              register={register("email", {
                required: t("emailRequired"),
                pattern: {
                  value: /^\S+@\S+$/i,
                  message: t("invalidEmail"),
                },
              })}
              error={errors.email}
              errorMessage={errors.email?.message}
            />

            {/* Password */}
            <InputField
              label={t("password")}
              id="password"
              type="password"
              placeholder={t("passwordPlaceholder")}
              icon={<Lock className="text-gray-700 w-4 h-4" />}
              register={register("password", {
                required: t("passwordRequired"),
              })}
              error={errors.password}
              errorMessage={errors.password?.message}
            />

            <Link
              to="/auth/Request-ResetPassword"
              className="label-text-alt text-sm w-full text-end underline hover:text-lighter-primary"
            >
              {t("forgotPassword")}
            </Link>

            {/* Submit */}
            <div className="w-full">
              <button
                type="submit"
                disabled={isPending}
                className="btn btn-gradient border-0 text-white shadow-lg w-full mt-4"
              >
                {isPending ? t("loggingIn") : t("login")}
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 text-center text-sm">
            {t("dontHaveAccount")}{" "}
            <Link
              to="/auth/register"
              className="underline text-primary hover:text-lighter-primary"
            >
              {t("signUp")}
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
