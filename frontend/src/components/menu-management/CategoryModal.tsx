import { useTranslation } from "react-i18next";
import { useMenuQuery } from "@/hooks/useMenuQuery";
import CategoryForm from "./CategoryForm";
import Modal, { type ModalRef } from "../ui/Modal";
import type { CategoryFormInputs } from "@/types/validations/menu/category";
import type { Category } from "@/types/category";
import toast from "react-hot-toast";
import { AxiosError } from "axios";
import { useEffect, useState, useRef } from "react";

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingCategory?: Category | null;
  isOcr?: boolean;
  ocrSubmit?: () => void;
  onSkip?: () => void;
  showCloseButton?: boolean;
}

const CategoryModal: React.FC<CategoryModalProps> = ({
  isOpen,
  onClose,
  editingCategory = null,
  isOcr = false,
  ocrSubmit,
  onSkip = () => {},
  showCloseButton = true,
}) => {
  const { t } = useTranslation();
  const {
    createCategory,
    updateCategory,
    createCategoryLoading,
    updateCategoryLoading,
  } = useMenuQuery();

  const [GlobalError, setGlobalError] = useState<string | Error>();
  useEffect(() => {
    setGlobalError("");
  }, [isOpen]);

  const modalRef = useRef<ModalRef>(null);

  // submit function for edit and adding category
  const handleSubmit = async (formData: CategoryFormInputs, _id?: string) => {
    setGlobalError("");
    try {
      if (_id && _id != "") {
        await updateCategory({ data: formData, _id });
        toast.success(t("menu.categories.updateSuccess"));
      } else {
        console.log("test");
        await createCategory(formData);
        toast.success(t("menu.categories.createSuccess"));
        if (isOcr && modalRef.current) modalRef.current.scrollContentToTop();
        if (isOcr) {
          ocrSubmit?.();
          return;
        }
      }
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
    }
  };

  const handleSkip = () => {
    if (isOcr && modalRef.current) modalRef.current.scrollContentToTop();
    onSkip();
  };

  const modalTitle =
    editingCategory && !isOcr
      ? t("menu.modals.editCategory")
      : t("menu.modals.addCategory");

  const isLoading =
    editingCategory && !isOcr ? updateCategoryLoading : createCategoryLoading;

  return (
    <Modal
      ref={modalRef}
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      size="xl"
      showCloseButton={showCloseButton}
      closeOnOverlayClick={!isLoading && !isOcr}
      closeOnEscape={!isLoading && !isOcr}
      ariaLabel={modalTitle}
      ariaDescribedBy="category-form"
    >
      <div id="category-form">
        <CategoryForm
          initialData={editingCategory}
          onSubmit={handleSubmit}
          onCancel={onClose}
          isLoading={isLoading}
          error={GlobalError}
          isOcr={isOcr}
          onSkip={handleSkip}
        />
      </div>
    </Modal>
  );
};

export default CategoryModal;
