import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import Modal from "../ui/Modal";
import InputField from "../InputField";
import {
  passwordChangeSchema,
  type PasswordChangeFormData,
} from "@/types/validations/user/changePassword.schema";
import { useChangePassword } from "@/hooks/useUsers";
import toast from "react-hot-toast";
import { AxiosError } from "axios";
import { useState } from "react";

interface PasswordChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  refetch: () => void;
}

const PasswordChangeModal: React.FC<PasswordChangeModalProps> = ({
  isOpen,
  onClose,
  refetch,
}) => {
  const { t } = useTranslation();
  const { mutate: changePassword, isPending } = useChangePassword();
  const [error, setError] = useState<string | Error>();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordChangeFormData>({
    resolver: zodResolver(passwordChangeSchema),
  });

  const handleFormSubmit = async (data: PasswordChangeFormData) => {
    try {
      setError("");
      const submittedData = {
        oldPassword: data.oldPassword,
        newPassword: data.newPassword,
      };
      changePassword(submittedData, {
        onSuccess: () => {
          reset();
          toast.success(t("settings.changePassword.messages.success"));
          onClose();
          refetch();
        },
        onError: (err: unknown) => {
          if (err instanceof AxiosError) {
            setError(
              err.response?.data?.message ||
                t("settings.changePassword.messages.failed"),
            );
          } else if (err instanceof Error) {
            setError(err.message);
          } else {
            setError(t("settings.changePassword.messages.failed"));
          }
          toast.error(t("settings.changePassword.messages.failed"));
        },
      });
    } catch (error) {
      console.log(error);
      toast.error(t("settings.changePassword.messages.unknownError"));
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("settings.changePassword.title")}
      size="md"
      closeOnOverlayClick={!isSubmitting}
      closeOnEscape={!isSubmitting}
    >
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        <InputField
          label={t("settings.changePassword.currentPassword")}
          id="currentPassword"
          icon={<Lock size={16} />}
          type="password"
          register={register("oldPassword")}
          error={errors.oldPassword}
          errorMessage={errors.oldPassword?.message}
          disabled={isSubmitting}
        />

        <InputField
          label={t("settings.changePassword.newPassword")}
          id="newPassword"
          icon={<Lock size={16} />}
          type="password"
          register={register("newPassword")}
          error={errors.newPassword}
          errorMessage={errors.newPassword?.message}
          disabled={isSubmitting}
        />

        <InputField
          label={t("settings.changePassword.confirmNewPassword")}
          id="confirmNewPassword"
          icon={<Lock size={16} />}
          type="password"
          register={register("confirmNewPassword")}
          error={errors.confirmNewPassword}
          errorMessage={errors.confirmNewPassword?.message}
          disabled={isSubmitting}
        />

        {error && (
          <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md dark:bg-red-900/20 dark:text-red-400">
            {typeof error === "string" ? error : error.message}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={isSubmitting || isPending}
            className="cursor-pointer px-4 py-2 border border-gray-300 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("settings.actions.cancel")}
          </button>
          <button
            type="submit"
            disabled={isSubmitting || isPending}
            className="cursor-pointer px-4 py-2 bg-primary text-white rounded-md hover:bg-darker-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {t("settings.actions.changePassword")}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default PasswordChangeModal;
