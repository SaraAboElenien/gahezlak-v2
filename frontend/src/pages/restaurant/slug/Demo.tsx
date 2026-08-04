import React, { useState } from "react";
import {
  Search,
  Filter,
  List,
  Grid3X3,
  ChevronDown,
  ChevronUp,
  Package,
  X,
} from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import ProductCard from "@/components/menu/ProductCard";
import { categories, menuItems } from "@/types/data";
import BannerSlider from "@/components/menu/BannerSlider";
import { useLang } from "@/hooks/useLang";
import { useTranslation } from "react-i18next";
import getLocalizedText from "@/utils/getLocalizedText";
import type { Category } from "@/types/category";
import type { MenuItem } from "@/types/menuItem";

const Demo: React.FC = () => {
  const { addToCart } = useCart();
  const { currentLang } = useLang();
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "price">("name");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );

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
        const matchesSelectedCategory = selectedCategory
          ? item.categoryId === selectedCategory
          : true;

        return matchesCategory && matchesSearch && matchesSelectedCategory;
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

      if (sortedItems.length > 0 && category) {
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

  return (
    <>
      <div id="demo">
        {/* Slider */}
        <div className="slider container mx-auto px-4">
          <BannerSlider menuItems={menuItems} />
        </div>

        {/* Menu Title */}
        <div className="px-4 mb-8">
          <div className="text-center">
            {/* Restaurant Type Badge */}
            <div className="inline-block bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-3">
              Restaurant
            </div>

            {/* Restaurant Name */}
            <h1 className="text-4xl md:text-5xl font-bold text-neutral mb-4">
              {t("publicMenu.menu")}
            </h1>

            {/* Decorative Line */}
            <div className="w-24 h-1 bg-primary mx-auto rounded-full"></div>
          </div>
        </div>

        {/* Search and Filter Section */}
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            {/* regular search */}
            <div className="relative flex-1">
              <Search className="absolute right-3 top-3 h-4 w-4 text-kitchen-warm" />
              <input
                className="flex h-10 w-full rounded-md bg-menu-primary/10 border border-gray-300 px-3 py-2 text-sm focus:outline-menu-primary pr-10"
                placeholder={t("publicMenu.searchForMeal")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-12 top-3 h-4 w-4 text-gray-400 hover:text-gray-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            {/* sort */}
            <div className="relative flex gap-3 w-full md:w-auto">
              <select
                className="appearance-none w-full md:w-48 flex items-center justify-center rounded-md bg-menu-primary/10 border border-gray-300 focus:outline-menu-primary h-10 px-4 pr-10 py-2 cursor-pointer"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "name" | "price")}
              >
                <option value="name">
                  {currentLang === "en" ? "Sort by Name" : "ترتيب حسب الاسم"}
                </option>
                <option value="price">
                  {currentLang === "en" ? "Sort by Price" : "ترتيب حسب السعر"}
                </option>
              </select>
              {/* Chevron icon for select */}
              <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center pr-2">
                <Filter className="h-5 w-5 text-primary" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 mb-6">
            {/* categoryFilter */}
            <select
              id="categorySelect"
              value={selectedCategory || ""}
              onChange={(e) =>
                setSelectedCategory(e.target.value ? e.target.value : null)
              }
              className="flex-1 bg-menu-primary/10 border border-gray-300 rounded-md focus:ring-menu-primary focus:border-menu-primary text-sm p-2 h-10"
            >
              <option value="">{t("publicMenu.allCategories")}</option>
              {categories.map((category: Category) => (
                <option key={category._id} value={category._id}>
                  {category.name[currentLang as "en" | "ar"]}
                </option>
              ))}
            </select>

            {/* display method */}
            <button
              onClick={() =>
                setViewMode(viewMode === "cards" ? "list" : "cards")
              }
              className="w-48 flex justify-center bg-menu-primary/10 border border-gray-300 px-4 py-2 rounded-md text-sm transition h-10"
            >
              {viewMode === "cards" ? <List /> : <Grid3X3 />}
            </button>
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
            {Object.values(groupedItems).map(
              ({
                category,
                items,
              }: {
                category: Category;
                items: MenuItem[];
              }) => (
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
                            {items.length}{" "}
                            {currentLang === "en" ? "items" : "عنصر"}
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
                          <ProductCard
                            key={item._id}
                            product={item}
                            addToCart={addToCart}
                            variant={viewMode === "cards" ? "grid" : "list"}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default Demo;
