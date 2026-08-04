import { Edit, Trash2, Package } from "lucide-react";
import { useMenuQuery } from "@/hooks/useMenuQuery";
import { useTranslation } from "react-i18next";
import Swal from "sweetalert2";
import toast from "react-hot-toast";
import type { Category, LocalizedText } from "@/types/category";
import { useLang } from "@/hooks/useLang";
import getLocalizedText from "@/utils/getLocalizedText";

interface CategoryCardProps {
  category: Category;
  itemCount: number;
  onEdit?: (category: Category) => void;
  currentLang: string;
}

const CategoryCard: React.FC<CategoryCardProps> = ({
  category,
  itemCount,
  onEdit,
}) => {
  const { t } = useTranslation();
  const { currentLang } = useLang();
  const getText = (text: { en: string; ar: string }) =>
    text[currentLang as keyof typeof text];
  const { deleteCategory, updateCategoryLoading, deleteCategoryLoading } =
    useMenuQuery();

  const handleEdit = () => {
    if (onEdit) {
      onEdit(category);
    }
  };

  const handleDelete = async (name: LocalizedText) => {
    const itemName = getLocalizedText(name, currentLang);
    const result = await Swal.fire({
      title:
        currentLang == "en"
          ? `Delete ${itemName} Category?`
          : `حذف فئة ${itemName}؟`,
      text: t("menu.delete.text"),
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: t("menu.delete.confirm"),
      cancelButtonText: t("menu.delete.cancel"),
      customClass: {
        confirmButton:
          "bg-primary hover:bg-darker-primary p-4 rounded-xl mx-2 text-primary-foreground cursor-pointer",
        cancelButton:
          "bg-destructive hover:bg-destructive/80 p-4 rounded-xl text-primary-foreground cursor-pointer",
      },
      buttonsStyling: false,
    });
    if (result.isConfirmed) {
      try {
        await deleteCategory(category._id);
        toast.success(
          currentLang == "en"
            ? `${itemName} Category has been deleted successfully`
            : `تم حذف فئة ${itemName} بنجاح`,
        );
      } catch (error) {
        console.log(error);
        toast.error(t("menu.delete.error"));
      }
    }
  };

  return (
    <>
      <div
        className={`
          relative bg-white dark:bg-card rounded-xl p-6 border border-gray-200 dark:border-gray-700
          shadow-sm hover:shadow-lg transition-all duration-300 ease-in-out
          transform hover:-translate-y-1 group overflow-hidden h-full flex flex-col
        `}
      >
        {/* Background gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Status indicator bar */}
        <div
          className={`absolute top-0 ${
            currentLang === "ar" ? "right-0" : "left-0"
          } w-1 h-full bg-gradient-to-b from-green-500 to-green-600`}
        />

        <div className="relative z-10 flex flex-col h-full ">
          {/* Header */}
          <div className="flex justify-between items-start mb-4 min-h-[72px]">
            <div className="flex-1">
              <h3 className="font-semibold text-xl text-gray-900 dark:text-white mb-1 group-hover:text-primary transition-colors duration-200 line-clamp-1">
                {getText(category.name)}
              </h3>
              {category.description && (
                <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed line-clamp-2">
                  {getText(category.description)}
                </p>
              )}
            </div>
          </div>

          {/* Items count */}
          <div className="flex items-center gap-2 mb-6 text-gray-500 dark:text-gray-400 h-6">
            <Package className="w-4 h-4" />
            <span className="text-sm font-medium">
              {itemCount} {t("menu.cards.items")}
            </span>
          </div>

          {/* Action buttons - pushed to bottom */}
          <div className="flex gap-3 mt-auto h-[44px]">
            <button
              onClick={handleEdit}
              disabled={updateCategoryLoading}
              className={`
                flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg
                font-medium text-sm transition-all duration-200
                bg-primary/10 text-primary hover:bg-primary hover:text-white
                border border-primary/20 hover:border-primary
                disabled:opacity-50 disabled:cursor-not-allowed
                group/edit cursor-pointer
              `}
            >
              <Edit className="w-4 h-4 group-hover/edit:scale-110 transition-transform" />
              <span>{t("menu.cards.edit")}</span>
            </button>

            <button
              onClick={() => handleDelete(category.name)}
              disabled={deleteCategoryLoading}
              className={`
                flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg
                font-medium text-sm transition-all duration-200
                bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400
                hover:bg-red-500 hover:text-white
                border border-red-200 dark:border-red-800 hover:border-red-500
                disabled:opacity-50 disabled:cursor-not-allowed
                group/delete cursor-pointer
              `}
            >
              <Trash2 className="w-4 h-4 group-hover/delete:scale-110 transition-transform" />
              <span>{t("menu.cards.delete")}</span>
            </button>
          </div>
        </div>

        {/* Loading overlay */}
        {(updateCategoryLoading || deleteCategoryLoading) && (
          <div className="absolute inset-0 bg-white/80 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center rounded-xl">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </>
  );
};

export default CategoryCard;
