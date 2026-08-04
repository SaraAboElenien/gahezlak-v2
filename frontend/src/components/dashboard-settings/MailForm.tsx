import { useCodeRequest } from "@/hooks/useUsers";
import {
  sendCodeSchema,
  type ChangeMailFormData,
} from "@/types/validations/user/changemail.schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail } from "lucide-react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import InputField from "../InputField";
import { useTranslation } from "react-i18next";
import { AxiosError } from "axios";

interface MailFormProps {
  setEmail: (x: string) => void;
  setStep: (x: "sendCode" | "verifyCode") => void;
  handleFormSubmitting: () => void;
  finishFormSubmitting: () => void;
}

const MailForm: React.FC<MailFormProps> = ({
  setEmail,
  setStep,
  handleFormSubmitting,
  finishFormSubmitting,
}) => {
  const { t } = useTranslation();
  const { mutate: requestCode, isPending: isPendingCodeRequest } =
    useCodeRequest();
  const {
    register: mailRegister,
    handleSubmit: mailSubmit,
    reset: mailReset,
    setError: mailSetError,
    formState: { errors: mailErrors, isSubmitting: mailIsSubmitting },
  } = useForm<ChangeMailFormData>({
    resolver: zodResolver(sendCodeSchema),
  });

  const handleSubmitMail = (data: ChangeMailFormData) => {
    try {
      handleFormSubmitting();
      requestCode(data, {
        onSuccess: () => {
          setEmail(data.newEmail);
          setStep("verifyCode");
          mailReset();
          toast.success(t("settings.changeEmail.messages.verificationSent"));
        },
        onError: (err: unknown) => {
          // Type-safe error handling
          if (err instanceof AxiosError) {
            mailSetError("newEmail", {
              type: "manual",
              message:
                err.response?.data?.message ||
                t("settings.changeEmail.messages.invalidEmail"),
            });
          } else if (err instanceof Error) {
            mailSetError("newEmail", {
              type: "manual",
              message: err.message,
            });
          } else {
            mailSetError("newEmail", {
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
    <form onSubmit={mailSubmit(handleSubmitMail)} className="space-y-4">
      <InputField
        label={t("settings.changeEmail.newEmail")}
        id="newEmail"
        icon={<Mail size={16} />}
        register={mailRegister("newEmail")}
        error={mailErrors.newEmail}
        errorMessage={mailErrors.newEmail?.message}
      />
      <button
        type="submit"
        disabled={mailIsSubmitting || isPendingCodeRequest}
        className="ms-auto mt-5 cursor-pointer px-4 py-2 bg-primary text-white rounded-md hover:bg-darker-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {mailIsSubmitting
          ? t("settings.changeEmail.buttons.sending")
          : t("settings.changeEmail.buttons.sendCode")}
      </button>
    </form>
  );
};

export default MailForm;
