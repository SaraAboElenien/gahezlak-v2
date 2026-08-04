import { Edit, Trash2, Image, Eye, EyeOff, Tag, Percent } from "lucide-react";
import { getFinalPrice } from "@/utils/priceCalculations";
import { useMenuQuery } from "@/hooks/useMenuQuery";
import { useTranslation } from "react-i18next";
import { useLang } from "@/hooks/useLang";
import getLocalizedText from "@/utils/getLocalizedText";
import type { MenuItem, ItemOption } from "@/types/menuItem";
import Swal from "sweetalert2";
import toast from "react-hot-toast";
import type { LocalizedText } from "@/types/category";

interface ItemCardProps {
  item: MenuItem;
  onEdit?: (item: MenuItem) => void;
}

const ItemCard: React.FC<ItemCardProps> = ({ item, onEdit }) => {
  const { t } = useTranslation();
  const { currentLang } = useLang();

  const { updateMenuItemLoading, deleteMenuItem, deleteMenuItemLoading } =
    useMenuQuery();
  const handleEdit = () => {
    if (onEdit) {
      onEdit(item);
    }
  };

  const handleDelete = async (name: LocalizedText) => {
    const itemName = getLocalizedText(name, currentLang);

    const result = await Swal.fire({
      title:
        currentLang == "en"
          ? `Delete ${itemName} item?`
          : `حذف عنصر ${itemName}؟`,
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
        await deleteMenuItem(item._id!);
        toast.success(
          currentLang == "en"
            ? `${itemName} item has been deleted successfully`
            : `تم حذف عنصر ${itemName} بنجاح`,
        );
      } catch (error) {
        console.error(error);
        toast.error(t("menu.delete.error"));
      }
    }
  };

  return (
    <div
      className={`
      relative bg-white dark:bg-card rounded-xl shadow-sm border border-gray-200 dark:border-gray-700
      overflow-hidden hover:shadow-lg transition-all duration-300 ease-in-out
      transform hover:-translate-y-1 h-full flex flex-col
    `}
    >
      {/* Status indicator */}
      <div
        className={`absolute top-0 ${
          currentLang === "ar" ? "right-0" : "left-0"
        } w-1 h-full bg-gradient-to-b ${
          item.isAvailable
            ? "from-green-500 to-green-600"
            : "from-red-500 to-red-600"
        }`}
      />

      {/* Image section */}
      <div className="relative aspect-video bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 overflow-hidden">
        {item.imgUrl ? (
          <img
            src={item.imgUrl}
            alt={getLocalizedText(item.name, currentLang)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 h-full">
            <Image className="w-12 h-12 mb-2" />
            <span className="text-sm font-medium">
              {t("menu.cards.noImage")}
            </span>
          </div>
        )}

        {/* Discount badge */}
        {item.discountPercentage && item.discountPercentage > 0 && (
          <div className="absolute top-3 right-3 bg-gradient-to-r from-red-500 to-red-600 text-white px-3 py-1 rounded-full text-xs font-medium shadow-lg flex items-center gap-1">
            <Percent className="w-3 h-3" />-{item.discountPercentage}%
          </div>
        )}

        {/* Availability overlay */}
        {!item.isAvailable && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-white/90 dark:bg-gray-800/90 px-4 py-2 rounded-lg flex items-center gap-2">
              <EyeOff className="w-4 h-4 text-red-500" />
              <span className="text-sm font-medium text-red-600 dark:text-red-400">
                {t("menu.cards.unavailable")}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col h-full">
        {/* Header */}
        <div className="flex justify-between items-start mb-1 min-h-[60px]">
          <h4 className="font-semibold text-lg text-gray-900 dark:text-white group-hover:text-primary transition-colors duration-200 line-clamp-2">
            {getLocalizedText(item.name, currentLang)}
          </h4>
          <span
            className={`
            flex items-center gap-1 px-2 py-1 text-xs rounded-full font-medium h-fit
            ${
              item.isAvailable
                ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
            }
          `}
          >
            {item.isAvailable ? (
              <Eye className="w-3 h-3" />
            ) : (
              <EyeOff className="w-3 h-3" />
            )}
            {item.isAvailable
              ? t("menu.cards.available")
              : t("menu.cards.unavailable")}
          </span>
        </div>

        {/* Description */}
        {item.description && (
          <div className="min-h-[68px]">
            <p className="text-gray-600 dark:text-gray-300 text-sm mb-2 line-clamp-2 leading-relaxed">
              {getLocalizedText(item.description, currentLang)}
            </p>
          </div>
        )}

        {/* Price */}
        <div className="flex items-center justify-between mb-4 h-2">
          <div className="flex items-center gap-2">
            <span
              className={`
              font-bold text-lg
              ${
                item.discountPercentage && item.discountPercentage > 0
                  ? "text-primary"
                  : "text-gray-900 dark:text-white"
              }
            `}
            >
              {getFinalPrice(item).toFixed(2)} EGP
            </span>
            {item.discountPercentage !== undefined &&
              item.discountPercentage > 0 && (
                <span
                  className={`text-sm text-gray-500 dark:text-gray-400 line-through`}
                >
                  {item.price.toFixed(2)} EGP
                </span>
              )}
          </div>
        </div>

        {/* Options */}
        {item.options && (
          <div
            className={`mb-4 ${
              item.options.length > 0 ? "min-h-[96px]" : "min-h-[24px]"
            }`}
          >
            {item.options.length > 0 ? (
              <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg h-full">
                <div className="flex items-center gap-2 mb-2">
                  <Tag className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t("menu.cards.options")}:
                  </span>
                </div>
                <div className="space-y-1">
                  {item.options
                    .slice(0, 2)
                    .map((option: ItemOption, i: number) => (
                      <div
                        key={i}
                        className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1"
                        dir={currentLang === "ar" ? "rtl" : "ltr"}
                      >
                        <span className="w-1 h-1 bg-primary rounded-full" />
                        <span>
                          {getLocalizedText(option.name, currentLang)}
                          <span className="mx-1">
                            ({option.choices.length} {t("menu.cards.choices")})
                          </span>
                        </span>
                      </div>
                    ))}
                  {item.options.length > 2 && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 italic">
                      +{item.options.length - 2} {t("menu.cards.moreOptions")}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full"></div>
            )}
          </div>
        )}

        {/* Action buttons - pushed to bottom */}
        <div className="flex gap-3 mt-auto h-[44px]">
          <button
            onClick={handleEdit}
            disabled={updateMenuItemLoading}
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
            onClick={() => handleDelete(item.name)}
            disabled={deleteMenuItemLoading}
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
      {updateMenuItemLoading ||
        (deleteMenuItemLoading && (
          <div className="absolute inset-0 bg-white/80 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center rounded-xl">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ))}
    </div>
  );
};

export default ItemCard;
