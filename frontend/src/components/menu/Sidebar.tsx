import { X, Home, ShoppingCart, Bell, Star } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { t } = useTranslation();

  const { slug } = useParams();
  const pathToMenu =
    slug && slug !== "demo" ? `/shops/${slug}/menu` : `/shops/demo`;
  const pathToCart =
    slug && slug !== "demo" ? `/shops/${slug}/cart` : `/shops/demo/cart`;
  const pathToFavourites =
    slug && slug !== "demo" ? `/shops/${slug}/saved` : `/shops/demo/saved`;
  const pathToTrack =
    slug && slug !== "demo" ? `/shops/${slug}/track` : `/shops/demo/track`;

  const menuItems = [
    {
      icon: Home,
      label: t("publicMenu.home"),
      link: pathToMenu,
    },
    {
      icon: Star,
      label: t("publicMenu.savedItems"),
      link: pathToFavourites,
    },
    {
      icon: ShoppingCart,
      label: t("publicMenu.cart"),
      link: pathToCart,
    },
    {
      icon: Bell,
      label: t("publicMenu.trackOrder"),
      link: pathToTrack,
    },
  ];

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-opacity-50 backdrop-blur-sm z-50"
          onClick={onClose}
        />
      )}

      <div
        className={`fixed top-0 left-0 h-full w-80 bg-white shadow-xl transform transition-transform duration-300 z-50 font-cairo ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-neutral">
              {t("publicMenu.navigationList")}
            </h2>
            <button className="btn btn-ghost btn-circle" onClick={onClose}>
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        <nav className="p-4">
          {menuItems.map((item, index) => (
            <Link
              key={index}
              to={`${item.link}`}
              onClick={onClose}
              className="flex items-center space-x-3 p-3 rounded-lg hover:bg-base-200 transition-colors"
            >
              <item.icon className="h-5 w-5 text-primary" />
              <span className="text-neutral">{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* <div className="socials absolute bottom-4 left-4 right-4 p-4 bg-base-200 rounded-lg flex itmes-center justify-center gap-4">
          <div className="faceBook text-blue-800">
                <Facebook/> 
          </div>
          <div className="insta text-pink-700 ">
                <Instagram/>
          </div>
          <div className="whatsapp text-green-600">
            <Phone/>
          </div>
        </div> */}
      </div>
    </>
  );
}
