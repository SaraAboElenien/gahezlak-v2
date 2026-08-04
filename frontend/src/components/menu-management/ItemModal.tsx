import { useTranslation } from "react-i18next";
import { useMenuQuery } from "@/hooks/useMenuQuery";
import MenuItemForm from "./MenuItemForm";
import Modal, { type ModalRef } from "../ui/Modal";
import type { MenuItem } from "@/types/menuItem";
import type { MenuItemFormInputs } from "@/types/validations/menu/items";
import toast from "react-hot-toast";
import { useEffect, useState, useRef } from "react";
import { AxiosError } from "axios";

interface ItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingItem?: MenuItem | null;
  isOcr?: boolean;
  ocrSubmit?: () => void;
  onSkip?: () => void;
  showCloseButton?: boolean;
}

const ItemModal: React.FC<ItemModalProps> = ({
  isOpen,
  onClose,
  editingItem = null,
  isOcr = false,
  ocrSubmit,
  onSkip,
  showCloseButton = true,
}) => {
  const { t } = useTranslation();
  const {
    createMenuItem,
    updateMenuItem,
    createMenuItemLoading,
    updateMenuItemLoading,
    categories,
  } = useMenuQuery();

  const [GlobalError, setGlobalError] = useState<string | Error>();
  useEffect(() => {
    setGlobalError("");
  }, []);

  // Reference to the modal for scrolling
  const modalRef = useRef<ModalRef>(null);

  // submit function for edit and adding menu item
  const handleSubmit = async (data: MenuItemFormInputs, _id?: string) => {
    setGlobalError("");

    const formData = new FormData();
    // Append name fields
    formData.append("name[en]", data.name.en);
    formData.append("name[ar]", data.name.ar);

    // Append description fields if they exist
    if (data.description) {
      formData.append("description[en]", data.description.en || "");
      formData.append("description[ar]", data.description.ar || "");
    }

    // Append other simple fields
    formData.append("price", data.price.toString());
    formData.append("categoryId", data.categoryId);
    formData.append("isAvailable", data.isAvailable ? "true" : "false");
    formData.append(
      "discountPercentage",
      (data.discountPercentage || 0).toString(),
    );

    // Append image if it exists
    if (data.image) {
      if (typeof data.image === "string") {
        // If it's a string URL (for editing existing item)
        formData.append("imageUrl", data.image);
      } else if (data.image instanceof FileList && data.image.length > 0) {
        // If it's a FileList (new file upload)
        formData.append("image", data.image[0]);
      }
    }

    // Append options if they exist
    if (data.options && data.options.length > 0) {
      data.options.forEach((option, index) => {
        formData.append(`options[${index}][name][en]`, option.name.en);
        formData.append(`options[${index}][name][ar]`, option.name.ar);
        formData.append(`options[${index}][type]`, option.type);
        formData.append(`options[${index}][required]`, String(option.required));

        option.choices.forEach((choice, choiceIndex) => {
          formData.append(
            `options[${index}][choices][${choiceIndex}][name][en]`,
            choice.name.en,
          );
          formData.append(
            `options[${index}][choices][${choiceIndex}][name][ar]`,
            choice.name.ar,
          );
          formData.append(
            `options[${index}][choices][${choiceIndex}][price]`,
            String(choice.price),
          );
        });
      });
    }

    try {
      if (_id && _id != "") {
        await updateMenuItem({ data: formData, _id });
        toast.success(t("menu.items.updateSuccess"));
      } else {
        await createMenuItem(formData);
        toast.success(t("menu.items.createSuccess"));
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
    if (onSkip) onSkip();
  };

  const modalTitle =
    editingItem && !isOcr
      ? t("menu.modals.editMenuItem")
      : t("menu.modals.addMenuItem");

  const isLoading =
    editingItem && !isOcr ? updateMenuItemLoading : createMenuItemLoading;
  return (
    <Modal
      ref={modalRef}
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      size="xl"
      closeOnOverlayClick={!isLoading && !isOcr}
      closeOnEscape={!isLoading && !isOcr}
      ariaLabel={modalTitle}
      ariaDescribedBy="menu-item-form"
      showCloseButton={showCloseButton}
    >
      <div id="menu-item-form">
        <MenuItemForm
          initialData={editingItem}
          categories={categories}
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

export default ItemModal;
