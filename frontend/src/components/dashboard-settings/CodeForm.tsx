import { useChangeMailCode } from "@/hooks/useUsers";
import {
  verifyCodeChangeMailSchema,
  type VerifyCodeChangeMailFormData,
} from "@/types/validations/user/Reset.schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import InputField from "../InputField";
import { useTranslation } from "react-i18next";
import { AxiosError } from "axios";

interface CodeFormProps {
  email: string;
  setStep: (x: "sendCode" | "verifyCode") => void;
  onClose: () => void;
  refetch: () => void;
  handleFormSubmitting: () => void;
  finishFormSubmitting: () => void;
}

const CodeForm: React.FC<CodeFormProps> = ({
  email,
  setStep,
  onClose,
  refetch,
  handleFormSubmitting,
  finishFormSubmitting,
}) => {
  const { t } = useTranslation();
  const { mutate: verifyCode, isPending } = useChangeMailCode();
  const {
    register: codeRegister,
    handleSubmit: codeSubmit,
    reset: codeReset,
    setError: codeSetError,
    formState: { errors: codeErrors, isSubmitting: codeIsSubmitting },
  } = useForm<VerifyCodeChangeMailFormData>({
    resolver: zodResolver(verifyCodeChangeMailSchema),
  });

  const handleSubmitCode = (data: { code: string }) => {
    try {
      handleFormSubmitting();
      verifyCode(data, {
        onSuccess: () => {
          toast.success(t("settings.changeEmail.messages.emailUpdated"));
          onClose();
          codeReset();
          refetch();
        },
        onError: (err: unknown) => {
          // Type-safe error handling
          if (err instanceof AxiosError) {
            codeSetError("code", {
              type: "manual",
              message:
                err.response?.data?.message ||
                t("settings.changeEmail.messages.invalidCode"),
            });
          } else if (err instanceof Error) {
            codeSetError("code", {
              type: "manual",
              message: err.message,
            });
          } else {
            codeSetError("code", {
              type: "manual",
              message: t("settings.changeEmail.messages.verificationFailed"),
            });
          }
          toast.error(t("settings.changeEmail.messages.verificationFailed"));
        },
      });
    } catch (error) {
      console.log(error);
      toast.error(t("settings.changeEmail.messages.unknownError"));
    } finally {
      finishFormSubmitting();
    }
  };
  return (
    <form onSubmit={codeSubmit(handleSubmitCode)} className="space-y-4">
      <p className="mb-2">Code sent to {email}</p>
      <InputField
        label={t("settings.changeEmail.verificationCode")}
        id="verificationCode"
        register={codeRegister("code")}
        error={codeErrors.code}
        errorMessage={codeErrors.code?.message}
      />
      <div className="flex justify-between mt-5 items-center">
        <button
          type="button"
          onClick={() => setStep("sendCode")}
          className="text-sm text-primary cursor-pointer hover:text-darker-primary"
        >
          {t("settings.changeEmail.buttons.resend")}
        </button>
        <button
          type="submit"
          disabled={codeIsSubmitting || isPending}
          className="ms-auto cursor-pointer px-4 py-2 bg-primary text-white rounded-md hover:bg-darker-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {codeIsSubmitting
            ? t("settings.changeEmail.buttons.verifying")
            : t("settings.changeEmail.buttons.confirm")}
        </button>
      </div>
    </form>
  );
};

export default CodeForm;
