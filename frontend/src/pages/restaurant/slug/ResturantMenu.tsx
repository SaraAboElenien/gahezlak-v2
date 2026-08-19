import React, { useEffect, useState } from "react";
import {
  Search,
  Filter,
  List,
  Grid3X3,
  X,
  Package,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import ProductCard from "@/components/menu/ProductCard";
import BannerSlider from "@/components/menu/BannerSlider";
import { useParams } from "react-router-dom";
import {
  usePublicMenuItems,
  usePublicShopCategories,
  usePublicShopDetails,
  useSearchWithAi,
} from "@/hooks/usePublicShopData";
import type { MenuItem as ApiMenuItem, MenuItem } from "@/types/menuItem";
import type { Category } from "@/types/category";
import { useLang } from "@/hooks/useLang";
import { useTranslation } from "react-i18next";
import getLocalizedText from "@/utils/getLocalizedText";
import toast from "react-hot-toast";
import { AI_ENABLED } from "@/config/features";
import AiAllergyNotice from "@/components/menu/AiAllergyNotice";

const RestaurantMenu: React.FC = () => {
  const { addToCart } = useCart();
  const { currentLang } = useLang();
  const { t } = useTranslation();
  const [AiSearchTerm, setAiSearchTerm] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "price">("name");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [displayedItems, setDisplayedItems] = useState<MenuItem[]>([]);
  const [originalItems, setOriginalItems] = useState<MenuItem[]>([]);
  const [AiSuccessMsg, setAiSuccessMsg] = useState<string>("");
  const [aiHiddenCount, setAiHiddenCount] = useState<number>(0);

  const { slug } = useParams<{ slug: string }>();
  const { data: menuItems, isLoading: isMenuLoading } = usePublicMenuItems(
    slug!,
  );
  const { data: shopDetails } = usePublicShopDetails(slug!);
  const { data: categories, isLoading: isCategoriesLoading } =
    usePublicShopCategories(slug!);
  const { mutateAsync: searchWithAi, isPending: isAiLoading } =
    useSearchWithAi();

  // Move useEffect after hook declarations
  useEffect(() => {
    if (menuItems?.data) {
      setDisplayedItems(menuItems.data);
      setOriginalItems(menuItems.data);
    }
  }, [menuItems]);

  const handleAiSearch = async () => {
    try {
      if (!slug || !shopDetails?.data._id) return;
      const submittedData = {
        query: AiSearchTerm,
        shopId: shopDetails?.data._id,
      };
      const response = await searchWithAi(submittedData);
      setDisplayedItems(response.data.safeItems as MenuItem[]);
      // Kept, not discarded: an excluded dish usually means "no allergen data
      // for this one", and a customer shown an empty menu with no explanation
      // reads it as "nothing here for me". AiAllergyNotice says which it is.
      setAiHiddenCount(response.data.unsafeItems.length);
      setAiSuccessMsg(`${response.data.safeItems.length} AI recommended items`);
    } catch (err) {
      toast.error(
        currentLang === "en"
          ? "Something wrong. Please try again"
          : "برجاء المحاولة مري اخري",
      );
      console.log(err);
    }
  };

  const handleClearAiSearch = () => {
    setAiSearchTerm("");
    setAiSuccessMsg("");
    setAiHiddenCount(0);
    if (originalItems.length > 0) {
      setDisplayedItems(originalItems);
    }
  };

  // Group items by category
  const groupedItems = categories?.data.reduce(
    (acc, category) => {
      const itemsToUse = AiSearchTerm ? displayedItems : originalItems;
      const categoryItems = itemsToUse.filter((item: MenuItem) => {
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

      if (sortedItems.length > 0 && category._id) {
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

  // Loading state
  if (isMenuLoading || isCategoriesLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">{t("publicMenu.loadingMenu")}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div id="demo">
        {/* Slider */}
        <div className="slider container mx-auto px-4">
          {menuItems && <BannerSlider menuItems={menuItems?.data} />}
        </div>

        {/* Menu Title */}
        <div className="px-4 mb-8">
          <div className="text-center">
            {/* Restaurant Type Badge */}
            <div className="inline-block bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-3">
              {shopDetails?.data.type
                ? shopDetails.data.type.charAt(0).toUpperCase() +
                  shopDetails.data.type.slice(1)
                : "Restaurant"}
            </div>

            {/* Restaurant Name */}
            <h1 className="text-4xl md:text-5xl font-bold text-neutral mb-4">
              {shopDetails?.data.name}
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

          {/* AI menu search. Hidden unless the AI feature is switched
              on — see src/config/features.ts; the backend routes 406 without a
              key, so an always-failing search box is worse than none. */}
          {AI_ENABLED && (
            <div className="w-full mt-3">
              <div className="flex flex-col md:flex-row  gap-3 mb-6 w-full">
                <div className="relative flex-1">
                  <input
                    className={`flex h-10 w-full  rounded-md bg-menu-primary/10 border ${
                      isAiLoading ? "border-primary/50" : "border-gray-300"
                    } px-8 py-2 text-sm focus:outline-menu-primary ${
                      currentLang === "ar" ? "pr-8 pl-10" : "pl-8 pr-10"
                    } ${isAiLoading ? "opacity-80" : ""}`}
                    placeholder={
                      currentLang === "en"
                        ? "Ask AI E.g. 'Gluten-free options', 'Nut allergy safe', 'Diabetic-friendly meals', 'High protein dishes'"
                        : "مثال: 'أطباق خالية من الجلوتين'، 'مناسبة لحساسية المكسرات'، 'وجبات لمرضى السكري'، 'أطعمة غنية بالبروتين'"
                    }
                    value={AiSearchTerm}
                    onChange={(e) => setAiSearchTerm(e.target.value)}
                    disabled={isAiLoading}
                    dir={currentLang === "ar" ? "rtl" : "ltr"}
                  />

                  <Sparkles
                    className={`h-4 w-4 absolute top-3 ${
                      currentLang === "ar" ? "right-3" : "left-3"
                    } ${
                      isAiLoading
                        ? "text-primary/50 animate-pulse"
                        : "text-primary"
                    }`}
                  />

                  <div
                    className={`hidden md:flex absolute ${
                      currentLang === "ar" ? "left-3" : "right-3"
                    } top-1/2 -translate-y-1/2 items-center gap-2`}
                  >
                    <div className="flex flex-col items-center justify-center">
                      {AiSuccessMsg && (
                        <>
                          <span className="text-xs text-primary px-2 py-1 rounded-full flex gap-1">
                            <Sparkles
                              className={`h-4 w-4 ${
                                isAiLoading ? "animate-pulse" : ""
                              }`}
                            />
                            {currentLang === "en"
                              ? `${displayedItems.length} AI recommended items`
                              : `${displayedItems.length} عنصر موصى به من الذكاء الاصطناعي`}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex self-end gap-1">
                  {AiSuccessMsg && (
                    <div className="md:hidden flex flex-col items-start">
                      <span className="text-xs text-primary px-2 py-1 rounded-full flex gap-1">
                        <Sparkles
                          className={`h-4 w-4 ${
                            isAiLoading ? "animate-pulse" : ""
                          }`}
                        />
                        {currentLang === "en"
                          ? `${displayedItems.length} AI recommended items`
                          : `${displayedItems.length} عنصر موصى به من الذكاء الاصطناعي`}
                      </span>
                    </div>
                  )}
                  <button
                    onClick={handleClearAiSearch}
                    disabled={!AiSearchTerm || isAiLoading}
                    className={`btn w-auto md:w-28 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600rounded-md border-none outline-none text-gray-800 dark:text-gray-200 text-xstransition-colors duration-200${
                      !AiSearchTerm || isAiLoading
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:shadow-sm"
                    }`}
                  >
                    {currentLang === "en" ? "Clear" : "مسح"}
                  </button>

                  <button
                    onClick={handleAiSearch}
                    disabled={isAiLoading}
                    className={`btn w-auto md:-w-48 bg-gradient-to-r from-menu-primary to-menu-secondary rounded border-none outline-0 text-white text-xs ${
                      isAiLoading
                        ? "opacity-70 cursor-not-allowed"
                        : "hover:bg-menu-primary/80"
                    }`}
                  >
                    {isAiLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg
                          className="animate-spin h-4 w-4 text-white"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        {currentLang === "en"
                          ? "Searching..."
                          : "جاري البحث..."}
                      </span>
                    ) : currentLang === "en" ? (
                      "Search With AI"
                    ) : (
                      "ابحث بمساعدة الذكاء الاصطناعي"
                    )}
                  </button>
                </div>
              </div>

              {/* Full-width and below the controls on purpose: the copy this
                  replaces was 10px grey italic tucked beside the result count,
                  on the one screen in the app where being wrong can hurt
                  someone. Only shown once a search has actually run. */}
              {AiSuccessMsg && (
                <AiAllergyNotice
                  currentLang={currentLang}
                  hiddenCount={aiHiddenCount}
                />
              )}
            </div>
          )}

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
              <option value="All">{t("publicMenu.allCategories")}</option>
              {categories?.data.map((category: Category) => (
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

        {/* display menu */}
        {groupedItems && Object.keys(groupedItems).length === 0 ? (
          // no items
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
          // items
          <div className="space-y-8 container mx-auto px-4 ">
            {groupedItems &&
              Object.values(groupedItems).map(({ category, items }) => (
                <div
                  key={category._id}
                  className="bg-white dark:bg-card rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
                >
                  {/* Category Header */}
                  <button
                    type="button"
                    className="w-full text-left bg-gradient-to-r from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/20 p-6 border-b border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-primary/20 transition-colors"
                    onClick={() =>
                      category._id && toggleCategoryCollapse(category._id)
                    }
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
                        {category._id &&
                        collapsedCategories.has(category._id) ? (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronUp className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Items Grid */}
                  {category._id && !collapsedCategories.has(category._id) && (
                    <div className="p-2 py-4">
                      {/* Menu Items Grid */}
                      {viewMode === "cards" ? (
                        <div className="container mx-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 px-2">
                          {items?.map((product: ApiMenuItem) => (
                            <ProductCard
                              key={product._id}
                              product={product}
                              addToCart={addToCart}
                              variant="grid"
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="container mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 px-2 my-5">
                          {items?.map((product: ApiMenuItem) => (
                            <ProductCard
                              key={product._id}
                              product={product}
                              addToCart={addToCart}
                              variant="list"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>
    </>
  );
};

export default RestaurantMenu;
