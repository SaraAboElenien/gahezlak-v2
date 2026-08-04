import { useTranslation } from "react-i18next";
import Modal from "../ui/Modal";
import { useState } from "react";
import MailForm from "./MailForm";
import CodeForm from "./CodeForm";

interface EmailChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  refetch: () => void;
}

const EmailChangeModal: React.FC<EmailChangeModalProps> = ({
  isOpen,
  onClose,
  refetch,
}) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<"sendCode" | "verifyCode">("sendCode");
  const [email, setEmail] = useState("");
  const [submitting, setIsSubmitting] = useState(false);

  const handleClose = () => {
    setStep("sendCode");
    onClose();
  };

  const handleFormSubmitting = () => {
    setIsSubmitting(true);
  };

  const finishFormSubmitting = () => {
    setIsSubmitting(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t("settings.changeEmail.title")}
      size="md"
      closeOnOverlayClick={!submitting}
      closeOnEscape={!submitting}
    >
      {step === "sendCode" ? (
        <MailForm
          setEmail={setEmail}
          setStep={setStep}
          handleFormSubmitting={handleFormSubmitting}
          finishFormSubmitting={finishFormSubmitting}
        />
      ) : (
        <CodeForm
          email={email}
          refetch={refetch}
          setStep={setStep}
          onClose={handleClose}
          handleFormSubmitting={handleFormSubmitting}
          finishFormSubmitting={finishFormSubmitting}
        />
      )}
    </Modal>
  );
};

export default EmailChangeModal;
