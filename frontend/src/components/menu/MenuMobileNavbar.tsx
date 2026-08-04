import type { MenuItem as ApiMenuItem } from "@/types/menuItem";
import { Home, Star, Bell, ShoppingCart } from "lucide-react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

const MobileNav = ({
  cartItmes,
  favourites,
}: {
  cartItmes: number;
  favourites: ApiMenuItem[];
}) => {
  const { t } = useTranslation();
  const location = useLocation();
  const { slug } = useParams();

  const pathToMenu =
    slug && slug !== "demo" ? `/shops/${slug}/menu` : `/shops/demo`;
  const pathToCart =
    slug && slug !== "demo" ? `/shops/${slug}/cart` : `/shops/demo/cart`;
  const pathToFavourites =
    slug && slug !== "demo" ? `/shops/${slug}/saved` : `/shops/demo/saved`;
  const pathToTrack =
    slug && slug !== "demo" ? `/shops/${slug}/track` : `/shops/demo/track`;

  const navItems = [
    {
      id: "menu",
      label: t("publicMenu.menu"),
      icon: Home,
      link: pathToMenu,
    },
    {
      id: "favourites",
      label: t("publicMenu.favourites"),
      icon: Star,
      link: pathToFavourites,
      badge: favourites.length,
    },
    {
      id: "cart",
      label: t("publicMenu.cart"),
      icon: ShoppingCart,
      link: pathToCart,
      badge: cartItmes,
    },
    {
      id: "trackOrder",
      label: t("publicMenu.trackOrder"),
      icon: Bell,
      link: pathToTrack,
    },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 ">
      <div className=" bg-white/80 backdrop-blur-lg border-t border-gray-200 px-4 py-2">
        <div className="flex items-center justify-around">
          {navItems.map((item) => {
            const IconComponent = item.icon;
            const isActive = location.pathname === item.link;

            return (
              <Link
                key={item.id}
                to={item.link}
                className={`relative flex flex-col items-center justify-center py-2 px-3 transition-all duration-300 transform ${
                  isActive
                    ? "text-menu-primary scale-110 bg-gray-400/10 rounded -translate-y-1"
                    : " hover:text-gray-700 hover:scale-105"
                }`}
              >
                {isActive && (
                  <div className="absolute inset-0 rounded scale-110 "></div>
                )}

                <div className="relative">
                  <IconComponent
                    className={`h-6 w-6 transition-all duration-300 ${
                      isActive ? "drop-shadow-lg" : ""
                    }`}
                  />

                  {item.badge === cartItmes && cartItmes > 0 ? (
                    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium animate-bounce">
                      {cartItmes}
                    </span>
                  ) : (
                    ""
                  )}

                  {item.badge === favourites.length && favourites.length > 0 ? (
                    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium animate-bounce">
                      {favourites.length}
                    </span>
                  ) : (
                    ""
                  )}
                </div>

                <span
                  className={`text-xs mt-1 font-medium transition-all duration-300 ${
                    isActive ? "opacity-100" : "opacity-70"
                  }`}
                >
                  {item.label}
                </span>

                {isActive && (
                  <div className="absolute -bottom-1 w-full h-1 bg-menu-primary rounded"></div>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MobileNav;
