import { PlusIcon } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import type { MenuItem } from "@/types/menuItem";
import { FaHeart } from "react-icons/fa6";
import { useState } from "react";
import { useLang } from "@/hooks/useLang";
import { useTranslation } from "react-i18next";
import { getFinalPrice } from "@/utils/priceCalculations";
import ProductModal from "./ProductModal";

interface ProductCardProps {
  product: MenuItem;
  addToCart: (
    item: MenuItem,
    quantity?: number,
    selectedOptions?: { [optionId: string]: string[] },
  ) => void;
  /** "grid" (default): square image on top, card layout. "list": image on the side, horizontal layout. */
  variant?: "grid" | "list";
}

interface SelectedOptions {
  [optionId: string]: string[]; // optionId -> selected choice IDs
}

export default function ProductCard({
  product,
  addToCart,
  variant = "grid",
}: ProductCardProps) {
  const { addToFavs, favourites } = useCart();
  const { currentLang } = useLang();
  const { t } = useTranslation();
  const isFav =
    favourites?.find((item: MenuItem) => item._id === product._id) || false;
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleAddToCart = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleAddToCartWithOptions = (
    product: MenuItem,
    quantity: number,
    selectedOptions?: SelectedOptions,
  ) => {
    addToCart(product, quantity, selectedOptions);
  };

  // Calculate final price (with discount if available)
  const finalPrice = getFinalPrice(product);

  const priceDisplay =
    product.discountPercentage && product.discountPercentage > 0 ? (
      <div>
        <div className="text-sm text-gray-500 flex items-center gap-2">
          <span className="line-through">{product.price} EGP</span>
          <span className="text-red-500 text-sm font-medium">
            -{product.discountPercentage}%
          </span>
        </div>
        <div>
          <span>{finalPrice.toFixed(2)} EGP</span>
        </div>
      </div>
    ) : (
      `${product.price} EGP`
    );

  const favouriteButton = (
    <button
      type="button"
      onClick={() => addToFavs(product)}
      aria-pressed={Boolean(isFav)}
      aria-label={
        isFav
          ? t("publicMenu.removeFromFavourites", "Remove from favourites")
          : t("publicMenu.addToFavourites", "Add to favourites")
      }
      className="absolute top-4 left-3 shadow bg-gray-100 p-2 rounded-full z-10 text-xs cursor-pointer transition-transform hover:scale-110"
    >
      <FaHeart
        className={` w-5 h-5 ${isFav ? " text-red-600 " : "  text-gray-400 "}`}
      />
    </button>
  );

  const addToCartButton = (
    <button
      onClick={handleAddToCart}
      className={`btn bg-gradient-to-r from-menu-primary to-menu-secondary border-none outline-0 hover:bg-menu-primary/80 text-white text-xs md:text-base p-3 flex items-center justify-center w-full sm:w-auto flex-shrink-0 ${
        variant === "list" ? "rounded" : ""
      }`}
    >
      <PlusIcon className="w-5 h-5" />
      {t("publicMenu.add")}
    </button>
  );

  return (
    <>
      {variant === "list" ? (
        <div className="group rounded bg-white border-b-2 border-t-2 border-menu-primary overflow-hidden relative h-full dir-ltr flex flex-row">
          {/* image */}
          <figure className="relative w-2/5 h-48 sm:h-full overflow-hidden flex justify-center items-center flex-shrink-0">
            <img
              src={product.imgUrl}
              alt={product.name[currentLang as "en" | "ar"]}
              className="object-cover w-40 h-40 rounded group-hover:scale-110 duration-300"
            />
            {favouriteButton}
          </figure>

          {/* description*/}
          <div
            className={` p-3 relative w-3/5 flex flex-col flex-grow justify-center mt-4 sm:mt-0 sm:mr-5 ${
              currentLang === "ar" ? "dir-rtl" : "dir-ltr"
            } `}
          >
            <h2 className="text-base md:text-lg font-bold truncate">
              {product.name[currentLang as "en" | "ar"]}
            </h2>
            <p className="text-xs md:text-sm text-menu-primary/70 flex-grow">
              {product.description[currentLang as "en" | "ar"]}
            </p>

            {/* add to cart */}
            <div className="mt-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <span className="text-base md:text-xl font-bold text-menu-primary">
                {priceDisplay}
              </span>
              {addToCartButton}
            </div>
          </div>
        </div>
      ) : (
        <div className="group bg-white shadow overflow-hidden relative h-full rounded-xl flex flex-col">
          {/* badge of hot offer or price  */}
          <div className="absolute top-5 -right-7 bg-red-500 text-white px-2 py-0.5 rounded z-10 text-sm rotate-45 w-28 text-center">
            {product.discountPercentage && product.discountPercentage > 0 ? (
              <div>
                <div className="line-through text-xs">{product.price} EGP</div>
                <div>{finalPrice.toFixed(2)} EGP</div>
              </div>
            ) : (
              `${product.price} EGP`
            )}
          </div>

          {/* image */}
          <figure className="relative w-full h-36 md:h-48 overflow-hidden flex justify-center items-center bg-gray-100 flex-shrink-0">
            <img
              src={product.imgUrl}
              alt={product.name[currentLang as "en" | "ar"]}
              className="object-cover w-full h-full rounded-xl group-hover:scale-110 duration-300"
            />
            {favouriteButton}
          </figure>

          {/* description*/}
          <div className="p-3 relative flex flex-col flex-grow">
            <h2 className="text-base md:text-lg font-bold truncate">
              {product.name[currentLang as "en" | "ar"]}
            </h2>
            <p className="text-xs md:text-sm text-menu-primary/70 flex-grow">
              {product.description[currentLang as "en" | "ar"]}
            </p>

            {/* add to cart */}
            <div className="mt-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <span className="text-base md:text-xl font-bold text-menu-primary">
                {priceDisplay}
              </span>
              {addToCartButton}
            </div>
          </div>
        </div>
      )}

      {/* Shared Product Modal */}
      <ProductModal
        product={product}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onAddToCart={handleAddToCartWithOptions}
      />
    </>
  );
}
