import { useState } from "react";
import Modal from "@/components/ui/Modal";
import { useLang } from "@/hooks/useLang";
import { useTranslation } from "react-i18next";
import type { MenuItem as ApiMenuItem } from "@/types/menuItem";
import {
  getFinalPrice,
  calculateTotalPrice,
  areRequiredOptionsSelected,
  handleOptionSelection,
} from "@/utils/priceCalculations";

interface SelectedOptions {
  [optionId: string]: string[]; // optionId -> selected choice IDs
}

interface ProductModalProps {
  product: ApiMenuItem;
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (
    product: ApiMenuItem,
    quantity: number,
    selectedOptions?: SelectedOptions,
  ) => void;
}

export default function ProductModal({
  product,
  isOpen,
  onClose,
  onAddToCart,
}: ProductModalProps) {
  const { currentLang } = useLang();
  const { t } = useTranslation();
  const [selectedOptions, setSelectedOptions] = useState<SelectedOptions>({});
  const [quantity, setQuantity] = useState(1);

  const handleCloseModal = () => {
    onClose();
    // Reset selections when modal closes
    setSelectedOptions({});
    setQuantity(1);
  };

  const handleOptionChange = (
    optionId: string,
    choiceId: string,
    isMultiple: boolean,
  ) => {
    setSelectedOptions((prev) =>
      handleOptionSelection(prev, optionId, choiceId, isMultiple),
    );
  };

  const handleQuantityChange = (increment: boolean) => {
    if (increment) {
      setQuantity((prev) => prev + 1);
    } else {
      setQuantity((prev) => Math.max(1, prev - 1));
    }
  };

  const handleAddToCartWithOptions = () => {
    if (!areRequiredOptionsSelected(product, selectedOptions)) {
      return; // Don't add to cart if required options aren't selected
    }

    onAddToCart(product, quantity, selectedOptions);
    handleCloseModal();
  };

  const finalPrice = getFinalPrice(product);
  const totalPrice = calculateTotalPrice(product, selectedOptions, quantity);
  const isRequiredOptionsSelected = areRequiredOptionsSelected(
    product,
    selectedOptions,
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCloseModal}
      title={product.name[currentLang as "en" | "ar"]}
      size="lg"
    >
      <div className="space-y-6">
        {/* Item Image and Basic Info */}
        <div className="flex flex-col sm:flex-row gap-4">
          <img
            src={product.imgUrl}
            alt={product.name[currentLang as "en" | "ar"]}
            className="w-full sm:w-32 h-32 object-cover rounded-lg self-center sm:self-start"
          />
          <div className="flex-1">
            <h3 className="text-xl font-bold mb-2">
              {product.name[currentLang as "en" | "ar"]}
            </h3>
            <p className="text-gray-600 mb-4">
              {product.description[currentLang as "en" | "ar"]}
            </p>
            <div className="text-lg font-bold text-menu-primary">
              {product.discountPercentage && product.discountPercentage > 0 ? (
                <div>
                  <div className=" text-gray-500 flex items-center gap-2">
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
                <span>{product.price} EGP</span>
              )}
            </div>
          </div>
        </div>

        {/* Options Section */}
        {product.options && product.options.length > 0 && (
          <div className="space-y-4">
            <h4 className="text-lg font-semibold">
              {t("publicMenu.customizeOrder")}
            </h4>
            {product.options.map((option) => (
              <div key={option._id} className="border rounded-lg p-4">
                <h5 className="font-medium mb-3">
                  {option.name[currentLang as "en" | "ar"]}{" "}
                  {option.required && t("publicMenu.required")}
                </h5>
                <div className="space-y-2">
                  {option.choices.map((choice) => (
                    <label
                      key={choice._id}
                      className="flex items-center justify-between p-2 border rounded hover:bg-gray-50 cursor-pointer"
                    >
                      <div className="flex items-center">
                        <input
                          type={option.required ? "radio" : "checkbox"}
                          name={option._id}
                          value={choice._id}
                          checked={(selectedOptions[option._id] || []).includes(
                            choice._id,
                          )}
                          onChange={() =>
                            handleOptionChange(
                              option._id,
                              choice._id,
                              !option.required,
                            )
                          }
                          className="mr-3"
                        />
                        <span className="text-sm sm:text-base">
                          {choice.name[currentLang as "en" | "ar"]}
                        </span>
                      </div>
                      <span className="text-menu-primary font-medium text-sm sm:text-base">
                        +{choice.price} EGP
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Quantity and Add to Cart */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pt-4 border-t gap-4">
          <div className="flex items-center gap-4">
            <span className="font-medium">{t("publicMenu.quantity")}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleQuantityChange(false)}
                className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 cursor-pointer"
              >
                -
              </button>
              <span className="w-8 text-center">{quantity}</span>
              <button
                onClick={() => handleQuantityChange(true)}
                className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 cursor-pointer"
              >
                +
              </button>
            </div>
          </div>
          <div className="flex flex-col items-center sm:items-end gap-2">
            <div className="text-lg font-bold text-menu-primary">
              {currentLang === "ar" ? "المجموع:" : "Total:"}{" "}
              {totalPrice.toFixed(2)} EGP
            </div>
            <button
              onClick={handleAddToCartWithOptions}
              disabled={!isRequiredOptionsSelected}
              className={`px-6 py-2 rounded-lg font-medium transition-opacity w-full sm:w-auto ${
                isRequiredOptionsSelected
                  ? "bg-gradient-to-r from-menu-primary to-menu-secondary text-white hover:opacity-90 cursor-pointer"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              {t("publicMenu.addToCart")}
            </button>
          </div>
        </div>

        {/* Warning message for required options */}
        {!isRequiredOptionsSelected && (
          <div className="text-red-500 text-sm text-center">
            {currentLang === "ar"
              ? "يرجى اختيار الخيارات المطلوبة"
              : "Please select required options"}
          </div>
        )}
      </div>
    </Modal>
  );
}
