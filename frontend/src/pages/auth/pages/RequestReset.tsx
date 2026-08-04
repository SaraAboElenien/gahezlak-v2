import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import InputField from "../../../components/InputField";
import {
  resetPasswordSchema,
  type ResetPasswordFormData,
} from "@/types/validations/user/Reset.schema";
import { useForgotPassword } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { useLang } from "@/hooks/useLang";
import { AxiosError } from "axios";

export function RequestResetPassword() {
  const { mutate: forgotPassword, isPending } = useForgotPassword();

  const nav = useNavigate();
  const { currentLang } = useLang();
  const { t } = useTranslation();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const onSubmit = (data: ResetPasswordFormData) => {
    try {
      forgotPassword(data, {
        onSuccess: () => {
          sessionStorage.setItem("resetEmail", data.email);
          toast.success(" Code Have Been Sent To your Email !");
          setTimeout(() => nav("/auth/reset-form"), 1000);
        },
        onError: (err: unknown) => {
          console.error("Login Error", err);
          const message =
            err instanceof AxiosError ? err.response?.data?.message : undefined;
          toast.error(` Error ${message || t("common.errors.generic")}.`);
        },
      });
    } catch {
      toast.error("some thing wrong happend. Please try again.");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 w-full">
      {/* Back to login */}
      <div
        className={` w-full max-w-md text-start mb-6 absolute top-5 ${currentLang === "ar" ? "right-5" : "left-5"}  `}
      >
        <Link to="/auth" className="text-sm text-gray-400 hover:text-black">
          ← {t("auth.backToLogin")}
        </Link>
      </div>

      {/* Step Progress */}
      <div className="flex items-baseline mb-6 w-full justify-center">
        <div className="flex flex-col items-center relative mt-1">
          <div className="w-10 h-10 flex items-center justify-center rounded-full bg-lighter-primary text-white">
            1
          </div>
          <span className="text-xs mt-1 text-black font-medium">
            {t("auth.steps.email")}
          </span>
        </div>

        <div
          className={` w-15 ${currentLang === "ar" ? "-mx-5" : "-mx-2"}  h-1 bg-black `}
        />

        <div className="flex flex-col items-center relative mt-1">
          <div className="w-10 h-10 flex items-center justify-center rounded-full bg-black text-white">
            3
          </div>
          <span className="text-xs mt-1 text-gray-400">
            {t("auth.steps.reset")}
          </span>
        </div>
      </div>

      {/* Email Entry Box */}
      <div className="text-center mb-6">
        <div className="bg-lighter-primary/10 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
          <Mail className="text-primary w-7 h-7" />
        </div>
        <h2 className="text-2xl font-semibold mb-2">{t("auth.forgotTitle")}</h2>
        <p className="text-gray-600 text-sm">{t("auth.forgotDescription")}</p>
      </div>

      {/* Form */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-md space-y-4"
      >
        <InputField
          label={t("form.email")}
          id="email"
          type="email"
          placeholder="m@example.com"
          icon={<Mail className="text-gray-700 w-4 h-4" />}
          register={register("email", {
            required: t("form.validation.emailRequired"),
            pattern: {
              value: /^\S+@\S+$/i,
              message: t("form.validation.invalidEmail"),
            },
          })}
          error={errors.email}
          errorMessage={errors.email?.message}
        />
        <button
          type="submit"
          className="btn btn-gradient border-0 text-white shadow-lg w-full flex items-center justify-center gap-2"
          disabled={isPending}
        >
          {isPending ? (
            t("auth.sending")
          ) : (
            <>
              <Mail className="w-4 h-4" />
              {t("auth.sendCode")}
            </>
          )}
        </button>
      </form>
    </div>
  );
}
