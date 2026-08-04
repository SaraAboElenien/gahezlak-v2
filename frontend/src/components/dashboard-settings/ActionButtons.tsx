import { useTranslation } from "react-i18next";
import { Edit, Save, X } from "lucide-react";

interface ActionButtonsProps {
  isEditing: boolean;
  isSubmitting: boolean;
  isDirty: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  // onDelete: () => void;
}

export const ActionButtons = ({
  isEditing,
  isSubmitting,
  isDirty,
  onEdit,
  onSave,
  onCancel,
}: // onDelete,
ActionButtonsProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex gap-2">
      {!isEditing ? (
        <button
          onClick={onEdit}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-darker-primary transition-colors cursor-pointer"
        >
          <Edit size={18} />
          {t("settings.actions.edit")}
        </button>
      ) : (
        <>
          <button
            onClick={onSave}
            disabled={!isDirty || isSubmitting}
            className={`flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md transition-colors ${
              !isDirty || isSubmitting
                ? "opacity-50 cursor-not-allowed"
                : "hover:bg-darker-primary cursor-pointer"
            }`}
          >
            {isSubmitting ? (
              <div className="animate-spin h-4 w-4 border-t-2 border-b-2 border-white rounded-full"></div>
            ) : (
              <Save size={18} />
            )}
            {t("settings.actions.save")}
          </button>
          <button
            onClick={onCancel}
            className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors cursor-pointer"
          >
            <X size={18} />
            {t("settings.actions.cancel")}
          </button>
        </>
      )}
      {/* <button
        onClick={() => onDelete()}
        className="flex items-center gap-2 px-4 py-2 bg-destructive text-white rounded-md hover:bg-destructive/80 transition-colors cursor-pointer"
      >
        <Trash2 size={18} />
        {t("settings.actions.delete")}
      </button> */}
    </div>
  );
};
