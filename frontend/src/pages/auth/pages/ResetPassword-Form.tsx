import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { KeyRound, Lock, Mail } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import InputField from "../../../components/InputField";
import {
  resetPasswordFinalSchema,
  type ResetPasswordFinalFormData,
  type ResetScema,
} from "@/types/validations/user/Reset.schema";
import { useResetPassword } from "@/hooks/useAuth";
import { useLang } from "@/hooks/useLang";
import { useTranslation } from "react-i18next";
import { AxiosError } from "axios";

export function ResetPasswordForm() {
  const { mutate: resetPassword, isPending } = useResetPassword();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFinalFormData>({
    resolver: zodResolver(resetPasswordFinalSchema),
  });

  const nav = useNavigate();
  const { currentLang } = useLang();
  const { t } = useTranslation();

  const email = sessionStorage.getItem("resetEmail");

  const onSubmit = (data: ResetPasswordFinalFormData) => {
    const userData: ResetScema = {
      email: data.email,
      code: data.code,
      newPassword: data.newPassword,
    };

    try {
      resetPassword(userData, {
        onSuccess: (res) => {
          console.log("Login Success", res.data);
          toast.success("Password has been reset successfully!");
          setTimeout(() => nav("/auth"), 1000);
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
      <div className="flex items-baseline mb-6">
        <div className="flex flex-col items-center relative mt-1">
          <div className="w-10 h-10 flex items-center justify-center rounded-full bg-black text-white">
            1
          </div>
          <span className="text-xs mt-1 text-gray-400">{t("auth.email")}</span>
        </div>

        <div
          className={` w-15 ${currentLang === "ar" ? "-mx-5" : "-mx-2"}  h-1 bg-black `}
        />

        <div className="flex flex-col items-center relative mt-1">
          <div className="w-10 h-10 flex items-center justify-center rounded-full bg-lighter-primary text-white">
            3
          </div>
          <span className="text-xs mt-1 text-black font-medium">
            {t("auth.reset")}
          </span>
        </div>
      </div>

      {/* Title */}
      <div className="text-center mb-6">
        <div className="bg-indigo-50 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
          <Lock className="text-primary w-7 h-7" />
        </div>
        <h2 className="text-2xl font-bold mb-2">
          {t("auth.resetPasswordTitle")}
        </h2>
        <p className="text-gray-600 text-sm">
          {t("auth.resetPasswordSubtitle")}
        </p>
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
          value={email}
          icon={<Mail className="text-gray-700 w-4 h-4" />}
          register={register("email")}
          error={errors.email}
          errorMessage={errors.email?.message}
        />

        <InputField
          label={t("form.verificationCode")}
          id="code"
          type="text"
          placeholder={t("form.verificationCodePlaceholder")}
          icon={<KeyRound className="text-gray-700 w-4 h-4" />}
          register={register("code")}
          error={errors.code}
          errorMessage={errors.code?.message}
        />

        <InputField
          label={t("form.newPassword")}
          id="password"
          type="password"
          placeholder={t("form.newPasswordPlaceholder")}
          icon={<Lock className="text-gray-700 w-4 h-4" />}
          register={register("newPassword")}
          error={errors.newPassword}
          errorMessage={errors.newPassword?.message}
        />

        <InputField
          label={t("form.confirmPassword")}
          id="confirmPassword"
          type="password"
          placeholder={t("form.confirmPasswordPlaceholder")}
          icon={<Lock className="text-gray-700 w-4 h-4" />}
          register={register("confirmPassword")}
          error={errors.confirmPassword}
          errorMessage={errors.confirmPassword?.message}
        />

        <button
          type="submit"
          className="btn btn-gradient border-0 text-white shadow-lg w-full flex items-center justify-center gap-2"
          disabled={isPending}
        >
          {isPending ? (
            t("auth.resetting")
          ) : (
            <>
              <Lock className="w-4 h-4" />
              {t("auth.resetPassword")}
            </>
          )}
        </button>
      </form>
    </div>
  );
}
