import { useState } from "react";
import CategoriesSection from "@/components/menu-management/CategoriesSection";
import { useMenuQuery } from "@/hooks/useMenuQuery";
import { Grid3X3, List, ChefHat, Package, Upload } from "lucide-react";
import MenuSection from "@/components/menu-management/MenuSection";
import { useTranslation } from "react-i18next";
import MenuUploadSection from "@/components/menu-management/MenuUploadSection";
import MenuEnrichSection from "@/components/menu-management/MenuEnrichSection";
import toast from "react-hot-toast";
import { AI_ENABLED } from "@/config/features";

const Menu: React.FC = () => {
  const { t } = useTranslation();
  const { categories, menuItems } = useMenuQuery();
  const [activeTab, setActiveTab] = useState<"categories" | "items" | "upload">(
    "categories",
  );

  // Statistics
  const totalCategories = categories.length;
  const totalItems = menuItems.length;
  const activeItems = menuItems.filter((item) => item.isAvailable).length;

  const handleCompleteUploadingMenu = () => {
    setActiveTab("items");
    toast.success("Please check the items tab to review the uploaded menu.");
  };

  return (
    <div
      className={`min-h-screen w-full bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900`}
    >
      {/* Hero Header */}
      <div className="bg-white dark:bg-card shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className=" mx-auto px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            {/* Title Section */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-primary to-darker-primary rounded-2xl flex items-center justify-center shadow">
                <ChefHat className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
                  {t("menu management")}
                </h1>
                <p className="text-lg text-gray-600 dark:text-gray-300">
                  {t("menu management description")}
                </p>
              </div>
            </div>
          </div>

          {/* Statistics Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
            <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 p-4 rounded-xl border border-green-200 dark:border-green-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                  <Grid3X3 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                    {t("categories")}
                  </p>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                    {totalCategories}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 p-4 rounded-xl border border-green-200 dark:border-green-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                  <Package className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                    {t("menu items")}
                  </p>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                    {totalItems}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 p-4 rounded-xl border border-green-200 dark:border-green-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                  <List className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                    {t("available items")}
                  </p>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                    {activeItems}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="container mx-auto px-6 py-6">
        <div className="bg-white dark:bg-card rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-2 mb-6">
          <div className="flex">
            {/* Menu OCR upload. Hidden unless the AI feature is switched on —
                see src/config/features.ts. A visible tab whose only action
                returns "not configured" is worse than no tab. */}
            {AI_ENABLED && (
              <button
                onClick={() => setActiveTab("upload")}
                className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
                  activeTab === "upload"
                    ? "bg-primary text-white shadow"
                    : "text-gray-600 dark:text-gray-300 hover:text-primary hover:bg-primary/10"
                }`}
              >
                <Upload className="w-5 h-5" />
                <span>{t("Upload Menu")}</span>
              </button>
            )}
            <button
              onClick={() => setActiveTab("categories")}
              className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
                activeTab === "categories"
                  ? "bg-primary text-white shadow"
                  : "text-gray-600 dark:text-gray-300 hover:text-primary hover:bg-primary/10"
              }`}
            >
              <Grid3X3 className="w-5 h-5" />
              <span>{t("categories")}</span>
              <span
                className={`px-2 py-1 text-xs rounded-full ${
                  activeTab === "categories"
                    ? "bg-white/20 text-white"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                }`}
              >
                {totalCategories}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("items")}
              className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
                activeTab === "items"
                  ? "bg-primary text-white shadow"
                  : "text-gray-600 dark:text-gray-300 hover:text-primary hover:bg-primary/10"
              }`}
            >
              <Package className="w-5 h-5" />
              <span>{t("menu items")}</span>
              <span
                className={`px-2 py-1 text-xs rounded-full ${
                  activeTab === "items"
                    ? "bg-white/20 text-white"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                }`}
              >
                {totalItems}
              </span>
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="transition-all duration-300">
          {activeTab === "categories" && <CategoriesSection />}
          {activeTab === "items" && (
            <>
              {/* Sits above the item list, on the tab where items are added
                  and edited — that is when a menu's analysis goes stale. */}
              {AI_ENABLED && <MenuEnrichSection />}
              <MenuSection />
            </>
          )}
          {AI_ENABLED && activeTab === "upload" && (
            <MenuUploadSection onComplete={handleCompleteUploadingMenu} />
          )}
        </div>
      </div>
    </div>
  );
};

export default Menu;
