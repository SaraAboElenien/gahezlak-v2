import { useState } from "react";
import { useMenuQuery } from "@/hooks/useMenuQuery";
import { useLang } from "@/hooks/useLang";
import ItemCard from "./ItemCard";
import { Plus, Search, Package, ChevronDown, ChevronUp } from "lucide-react";
import { useModal } from "@/hooks/useModal";
import ItemModal from "./ItemModal";
import type { MenuItem } from "@/types/menuItem";
import getLocalizedText from "@/utils/getLocalizedText";
import type { Category } from "@/types/category";
import { ErrorComponent } from "../ErrorComponent";
import Loader from "../Loader";

export default function MenuSection() {
  const {
    categories,
    menuItems,
    categoriesLoading,
    menuItemsLoading,
    categoriesError,
    menuItemsError,
  } = useMenuQuery();
  const { currentLang } = useLang();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "price">("name");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );

  const itemModal = useModal();
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

  // Group items by category
  const groupedItems = categories.reduce(
    (acc, category: Category) => {
      const categoryItems = menuItems.filter((item: MenuItem) => {
        const matchesCategory = item.categoryId === category._id;
        const matchesSearch =
          getLocalizedText(item.name, currentLang)
            .toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          getLocalizedText(item.description, currentLang)
            .toLowerCase()
            .includes(searchTerm.toLowerCase());
        const matchesAvailability = showAvailableOnly ? item.isAvailable : true;
        const matchesSelectedCategory = selectedCategory
          ? item.categoryId === selectedCategory
          : true;

        return (
          matchesCategory &&
          matchesSearch &&
          matchesAvailability &&
          matchesSelectedCategory
        );
      });

      // Sort items
      const sortedItems = [...categoryItems].sort((a, b) => {
        switch (sortBy) {
          case "price":
            return a.price - b.price;
          default:
            return getLocalizedText(a.name, currentLang).localeCompare(
              getLocalizedText(b.name, currentLang),
            );
        }
      });

      if (sortedItems.length > 0) {
        acc[category._id] = {
          category,
          items: sortedItems,
        };
      }

      return acc;
    },
    {} as Record<string, { category: Category; items: MenuItem[] }>,
  );

  const toggleCategoryCollapse = (categoryId: string) => {
    const newCollapsed = new Set(collapsedCategories);
    if (newCollapsed.has(categoryId)) {
      newCollapsed.delete(categoryId);
    } else {
      newCollapsed.add(categoryId);
    }
    setCollapsedCategories(newCollapsed);
  };

  // Handle add item
  const handleAddItem = () => {
    setEditingItem(null);
    itemModal.open();
  };

  // Handle edit item
  const handleEditItem = (item: MenuItem) => {
    setEditingItem(item);
    itemModal.open();
  };

  // Handle modal close
  const handleCloseModal = () => {
    itemModal.close();
    setEditingItem(null);
  };

  const totalItems = Object.values(groupedItems).reduce(
    (sum, group) => sum + group.items.length,
    0,
  );

  if (categoriesLoading || menuItemsLoading) return <Loader />;
  if (categoriesError || menuItemsError)
    return <ErrorComponent error={"Can't Load Menu Items"} />;

  return (
    <div>
      {/* Header */}
      <div className="bg-white dark:bg-card shadow-sm border-b border-gray-200 dark:border-gray-700 mb-6">
        <div className="p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {currentLang === "en" ? "Menu Items" : "عناصر القائمة"}
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {currentLang === "en"
                  ? `${totalItems} items across ${
                      Object.keys(groupedItems).length
                    } categories`
                  : `${totalItems} عنصر في ${
                      Object.keys(groupedItems).length
                    } فئة`}
              </p>
            </div>
            <button
              onClick={handleAddItem}
              className="flex items-center gap-2 bg-primary hover:bg-darker-primary text-white px-6 py-3 rounded-lg font-medium transition-all duration-200 hover:shadow-lg transform hover:-translate-y-0.5 cursor-pointer"
            >
              <Plus className="w-5 h-5" />
              {currentLang === "en" ? "Add Item" : "إضافة عنصر"}
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-card rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder={
                currentLang === "en"
                  ? "Search menu items..."
                  : "البحث في عناصر القائمة..."
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
            />
          </div>

          {/* Category Filter */}
          <select
            value={selectedCategory || ""}
            onChange={(e) =>
              setSelectedCategory(e.target.value ? e.target.value : null)
            }
            className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="">
              {currentLang === "en" ? "All Categories" : "جميع الفئات"}
            </option>
            {categories.map((category) => (
              <option key={category._id} value={category._id}>
                {getLocalizedText(category.name, currentLang)}
              </option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "name" | "price")}
            className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="name">
              {currentLang === "en" ? "Sort by Name" : "ترتيب حسب الاسم"}
            </option>
            <option value="price">
              {currentLang === "en" ? "Sort by Price" : "ترتيب حسب السعر"}
            </option>
          </select>

          {/* Filters */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={showAvailableOnly}
                onChange={(e) => setShowAvailableOnly(e.target.checked)}
                className="checkbox checkbox-success"
              />
              {currentLang === "en" ? "Available only" : "المتاح فقط"}
            </label>
          </div>
        </div>
      </div>

      {/* Items by Category */}
      {Object.keys(groupedItems).length === 0 ? (
        <div className="bg-white dark:bg-card rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            {currentLang === "en"
              ? "No items found"
              : "لم يتم العثور على عناصر"}
          </h3>
          <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
            {currentLang === "en"
              ? "Try adjusting your search terms or filters to find what you're looking for."
              : "حاول تعديل مصطلحات البحث أو المرشحات للعثور على ما تبحث عنه."}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.values(groupedItems).map(({ category, items }) => (
            <div
              key={category._id}
              className="bg-white dark:bg-card rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              {/* Category Header */}
              <div
                className="bg-gradient-to-r from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/20 p-6 border-b border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-primary/20 transition-colors"
                onClick={() => toggleCategoryCollapse(category._id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center">
                      <Package className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                        {getLocalizedText(category.name, currentLang)}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {items.length} {currentLang === "en" ? "items" : "عنصر"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {collapsedCategories.has(category._id) ? (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>
              </div>

              {/* Items Grid */}
              {!collapsedCategories.has(category._id) && (
                <div className="p-6">
                  <div
                    className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6`}
                  >
                    {items.map((item: MenuItem) => (
                      <ItemCard
                        key={item._id}
                        item={item}
                        onEdit={handleEditItem}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <ItemModal
        isOpen={itemModal.isOpen}
        onClose={handleCloseModal}
        editingItem={editingItem}
      />
    </div>
  );
}
