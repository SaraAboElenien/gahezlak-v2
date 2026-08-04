import { useMenuQuery } from "@/hooks/useMenuQuery";
import { useState } from "react";
import CategoryCard from "./CategoryCard";
import { useLang } from "@/hooks/useLang";
import { Plus, Filter, Search } from "lucide-react";
import CategoryModal from "./CategoryModal";
import { useModal } from "@/hooks/useModal";
import { useTranslation } from "react-i18next";
import type { Category } from "@/types/category";
import { ErrorComponent } from "../ErrorComponent";
import Loader from "../Loader";
import getLocalizedText from "@/utils/getLocalizedText";
import type { MenuItem } from "@/types/menuItem";

export default function CategoriesSection() {
  const { categories, categoriesLoading, categoriesError, menuItems } =
    useMenuQuery();
  const { currentLang } = useLang();
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const categoryModal = useModal();
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // Filter categories based on search and active status
  const filteredCategories = categories.filter((category: Category) => {
    const matchesSearch = getLocalizedText(category.name, currentLang)
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const totalItems = menuItems.length;

  // Handle add category
  const handleAddCategory = () => {
    setEditingCategory(null);
    categoryModal.open();
  };

  // Handle edit category
  const handleEditCategory = (category: Category) => {
    setEditingCategory(category);
    categoryModal.open();
  };

  // Handle modal close
  const handleCloseModal = () => {
    categoryModal.close();
    setEditingCategory(null);
  };

  if (categoriesLoading) return <Loader />;
  if (categoriesError)
    return <ErrorComponent error={"Can't Load Categories"} />;
  return (
    <div
      className={`min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800`}
    >
      {/* Header Section */}
      <div className="bg-white dark:bg-card shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className=" mx-auto p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Title and Stats */}
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                  {t("categories")}
                </h1>
                <div className="flex items-center gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
                  <span>
                    {categories.length} {t("total categories")}
                  </span>
                  <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                  <span>
                    {totalItems} {t("total items")}
                  </span>
                </div>
              </div>
            </div>

            {/* Add Category Button */}
            <button
              onClick={handleAddCategory}
              className="flex items-center gap-2 bg-primary hover:bg-darker-primary text-white px-6 py-3 rounded-lg font-medium transition-all duration-200 hover:shadow-md transform hover:-translate-y-0.5 cursor-pointer"
            >
              <Plus className="w-5 h-5" />
              {t("menu.modals.addCategory")}
            </button>
          </div>
        </div>
      </div>

      <div className=" mx-auto p-6">
        {/* Filters and Search */}
        <div className="bg-white dark:bg-card rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder={t("Search categories...")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
              />
            </div>
          </div>
        </div>

        {/* Results Info */}
        {searchTerm && (
          <div className="mb-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {currentLang === "en"
                ? `Found ${filteredCategories.length} categories matching "${searchTerm}"`
                : `تم العثور على ${filteredCategories.length} فئة تطابق "${searchTerm}"`}
            </p>
          </div>
        )}

        {/* Categories Grid/List */}
        {filteredCategories.length === 0 ? (
          <div className="bg-white dark:bg-card rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <Filter className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              {currentLang === "en"
                ? "No categories found"
                : "لم يتم العثور على فئات"}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
              {currentLang === "en"
                ? "Try adjusting your search terms or filters to find what you're looking for."
                : "حاول تعديل مصطلحات البحث أو المرشحات للعثور على ما تبحث عنه."}
            </p>
          </div>
        ) : (
          <div
            className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6`}
          >
            {filteredCategories.map((category: Category) => (
              <CategoryCard
                key={category._id}
                category={category}
                itemCount={
                  menuItems.filter(
                    (item: MenuItem) => item.categoryId === category._id,
                  ).length
                }
                onEdit={handleEditCategory}
                currentLang={currentLang}
              />
            ))}
          </div>
        )}
      </div>

      <CategoryModal
        isOpen={categoryModal.isOpen}
        onClose={handleCloseModal}
        editingCategory={editingCategory}
      />
    </div>
  );
}
