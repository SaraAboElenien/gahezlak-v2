import { useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { KeyRound, Mail } from "lucide-react";
import InputField from "../../../components/InputField";
import {
  verifyCodeSchema,
  type VerifyCodeFormData,
} from "@/types/validations/user/Reset.schema";
import { useResendCode, useVerifyCode } from "@/hooks/useAuth";
import { useLang } from "@/hooks/useLang";
import { useTranslation } from "react-i18next";
import { useProfile } from "@/hooks/useProfile";
import { AxiosError } from "axios";
import { setAccessToken } from "@/services/axiosInint";

export function VerifyResetCode() {
  const [resendTimer, setResendTimer] = useState(0);

  const { mutate: verifyCode, isPending } = useVerifyCode();
  const { mutate: resendCode, isPending: isResending } = useResendCode();
  const { refreshProfile } = useProfile();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VerifyCodeFormData>({
    resolver: zodResolver(verifyCodeSchema),
  });

  const nav = useNavigate();
  const { currentLang } = useLang();
  const { t } = useTranslation();

  const email: string | null = sessionStorage.getItem("resetEmail");

  const onSubmit = (data: VerifyCodeFormData) => {
    const payload = {
      ...data,
      reason: "account_verification",
    };

    try {
      verifyCode(payload, {
        onSuccess: (res) => {
          toast.success("Code Verified!");
          // Access token is held in memory only; the refresh token arrived as
          // an httpOnly cookie the browser stored for us.
          setAccessToken(res.data.accessToken);
          refreshProfile();
          setTimeout(() => nav("/auth/create-shop"), 1000);
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

  const handleResend = () => {
    if (!email) return toast.error("No email found to resend to.");
    resendCode(
      { email },
      {
        onSuccess: () => {
          toast.success("Verification code has been resent.");
          setResendTimer(30); // Start 30 seconds countdown
        },
        onError: (err: unknown) => {
          const message =
            err instanceof AxiosError ? err.response?.data?.message : undefined;
          toast.error(`Resend failed: ${message || "Unknown error"}`);
        },
      },
    );
  };

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (resendTimer > 0) {
      timer = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendTimer]);

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

      {/* Verification Code Entry Box */}
      <div className="text-center mb-6">
        <div className="bg-primary/10 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
          <KeyRound className="text-primary w-7 h-7" />
        </div>
        <h2 className="text-2xl font-bold mb-2">{t("verify.title")}</h2>
        <p className="text-gray-600 text-sm">{t("verify.description")}</p>
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
          label={t("form.code")}
          id="code"
          type="text"
          placeholder={t("form.codePlaceholder")}
          icon={<KeyRound className="text-gray-700 w-4 h-4" />}
          register={register("code")}
          error={errors.code}
          errorMessage={errors.code?.message}
        />

        <button
          type="submit"
          className="btn btn-gradient border-0 text-white shadow-lg w-full flex items-center justify-center gap-2"
          disabled={isPending}
        >
          {isPending ? (
            t("verify.verifying")
          ) : (
            <>
              <KeyRound className="w-4 h-4" />
              {t("verify.button")}
            </>
          )}
        </button>

        <div className="text-center mt-4 cursor-pointer">
          <button
            type="button"
            onClick={handleResend}
            disabled={resendTimer > 0 || isResending}
            className="text-primary text-sm font-medium hover:underline disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            {isResending
              ? t("verify.resending")
              : resendTimer > 0
                ? t("verify.sendAgainAfter", { seconds: resendTimer })
                : t("verify.resend")}
          </button>
        </div>
      </form>
    </div>
  );
}
