import React from "react";
import { Menu, ShoppingCart, Globe } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useLang } from "@/hooks/useLang";
import { useTranslation } from "react-i18next";
import type { PublicShop } from "@/types/shop";

interface NavbarProps {
  onMenuToggle: () => void;
  shopData: PublicShop | undefined;
  cartItems: number;
  isLoading?: boolean;
}

const MenuNavbar: React.FC<NavbarProps> = ({
  onMenuToggle,
  shopData,
  cartItems,
}: NavbarProps) => {
  const { currentLang, toggleLanguage } = useLang();
  const { t } = useTranslation();
  const { slug } = useParams();

  const pathToMenu =
    slug && slug !== "demo" ? `/shops/${slug}/menu` : `/shops/demo`;
  const pathToCart = slug ? `/shops/${slug}/cart` : `/shops/demo/cart`;

  return (
    <div className="navbar bg-gradient-to-r from-menu-primary to-menu-secondary shadow-sm sticky top-0 z-50 text-white py-3 px-3 md:py-4 md:px-4">
      <div className="navbar-start">
        {/* Menu toggle button - Only show on medium screens and larger */}
        <button
          className="hidden md:flex btn btn-ghost btn-circle"
          onClick={onMenuToggle}
        >
          <Menu className="h-5 w-5 md:h-6 md:w-6" />
        </button>
        <Link
          to={pathToMenu}
          className="flex items-center space-x-2 ms-2 md:ms-5"
        >
          <div className="w-8 h-8 md:w-10 md:h-10 bg-primary rounded-full flex flex-col items-center justify-center overflow-hidden">
            {shopData ? (
              <img
                src={shopData?.logoUrl || "/default.jpg"}
                alt={shopData?.name || "Demo Shop"}
                className="w-full h-full object-cover"
              />
            ) : (
              <img
                src={"/default.jpg"}
                alt={"Demo Shop"}
                className="w-full h-full object-cover"
              />
            )}
          </div>
          {shopData ? (
            // <div className="h-6 md:h-8 w-20 md:w-32 bg-white/20 animate-pulse rounded-md" />
            <h1 className="text-lg md:text-2xl font-bold max-w-36 md:max-w-none">
              {shopData?.name || (slug === "demo" ? "Demo Shop" : "Shop")}
            </h1>
          ) : (
            <h1 className="text-lg md:text-2xl font-bold max-w-24 md:max-w-none">
              {"Demo Shop"}
            </h1>
          )}
        </Link>
      </div>

      <div className="navbar-end">
        <div className="flex items-center gap-2 md:gap-3">
          {/* Language Toggle Button */}
          <button
            onClick={toggleLanguage}
            className="hidden sm:flex items-center gap-2 px-2 md:px-3 py-2 md:py-3 bg-white/20 hover:bg-white/30 rounded-md transition-colors duration-200 cursor-pointer"
            title={
              currentLang === "en" ? "Switch to Arabic" : "Switch to English"
            }
          >
            <Globe className="w-4 h-4" />
            <span className="font-sans font-medium text-sm md:text-base">
              {currentLang === "en"
                ? t("publicMenu.arabic")
                : t("publicMenu.english")}
            </span>
          </button>

          {/* Mobile Language Toggle (Icon Only) */}
          <button
            onClick={toggleLanguage}
            className="sm:hidden flex items-center justify-center p-2 bg-white/20 hover:bg-white/30 rounded-md transition-colors duration-200 cursor-pointer"
            title={
              currentLang === "en" ? "Switch to Arabic" : "Switch to English"
            }
          >
            <Globe className="w-4 h-4" />
          </button>

          {/* Cart section */}
          <Link
            to={pathToCart}
            className="relative flex items-center gap-1 md:gap-2 p-2 md:px-4 bg-menu-light text-menu-primary rounded-md font-bold text-sm md:text-lg"
          >
            <span className="hidden sm:inline">{t("publicMenu.cart")}</span>
            <ShoppingCart className="w-4 h-4 md:w-5 md:h-5" />
            {cartItems > 0 && (
              <span className="absolute -top-1 -right-1 md:-top-2 md:-right-2 bg-orange-600 text-white rounded-full text-xs w-4 h-4 md:w-5 md:h-5 flex items-center justify-center">
                {cartItems}
              </span>
            )}
          </Link>
        </div>
      </div>
    </div>
  );
};

export default MenuNavbar;
