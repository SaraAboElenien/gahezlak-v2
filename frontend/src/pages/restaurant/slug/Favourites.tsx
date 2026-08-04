import { useCart } from "@/hooks/use-cart";
import ProductCard from "../../../components/menu/ProductCard";
import { useTranslation } from "react-i18next";
import type { MenuItem } from "@/types/menuItem";

export default function Favourites() {
  const { favourites, addToCart } = useCart();
  const { t } = useTranslation();
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">{t("publicMenu.savedItems")}</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {favourites.map((product: MenuItem) => (
          <ProductCard
            key={product._id}
            product={product}
            addToCart={addToCart}
          />
        ))}
      </div>
    </div>
  );
}
