import { useTranslation } from "react-i18next";
import Modal from "../ui/Modal";
import StaffForm from "./StaffForm";
import { useStaff } from "@/hooks/useStaff";
import type { AddStaffRequest } from "@/types/validations/user/staff";
import toast from "react-hot-toast";
import { useEffect, useState } from "react";
import { AxiosError } from "axios";

interface StaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  shopId: string;
}

const StaffModal: React.FC<StaffModalProps> = ({ isOpen, onClose, shopId }) => {
  const { t } = useTranslation();
  const [GlobalError, setGlobalError] = useState<string | Error>();
  useEffect(() => {
    setGlobalError("");
  }, [isOpen]);

  const { addMember, addMemberLoading } = useStaff();
  const handleSubmit = async (data: AddStaffRequest) => {
    setGlobalError("");
    try {
      console.log(data);
      await addMember({ shopId: shopId, formData: data });
      toast.success(t("staffPage.addMemberSuccess"));
      onClose();
    } catch (err) {
      if (err instanceof AxiosError) {
        setGlobalError(
          err.response?.data?.message || t("common.errors.generic"),
        );
      } else if (err instanceof Error) {
        setGlobalError(err.message);
      } else {
        setGlobalError(t("common.errors.generic"));
      }
      toast.error(t("common.errors.generic"));
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("staffPage.modals.addMember") || "Add Staff Member"}
      size="xl"
      closeOnOverlayClick={!addMemberLoading}
      closeOnEscape={!addMemberLoading}
      ariaLabel={"Add Staff Member"}
      ariaDescribedBy="staff-form"
    >
      <div id="staff-form">
        <StaffForm
          onCancel={onClose}
          onSubmit={handleSubmit}
          error={GlobalError}
        />
      </div>
    </Modal>
  );
};

export default StaffModal;
