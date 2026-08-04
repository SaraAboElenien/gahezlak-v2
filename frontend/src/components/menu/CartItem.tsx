import type { CartItem, CartItemOption } from "@/types/validations/menu/menu";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useLang } from "@/hooks/useLang";
import { useTranslation } from "react-i18next";
import getLocalizedText from "@/utils/getLocalizedText";

interface CartProps {
  item: CartItem;
  updateQuantity: (id: string, quantity: number) => void;
  removeItem: (id: string) => void;
}

export default function CartItem({
  item,
  updateQuantity,
  removeItem,
}: CartProps) {
  const { currentLang } = useLang();
  const { t } = useTranslation();

  // Get selected options details for display
  const selectedOptionsDetails = item.selectedOptionsDetails;

  return (
    <>
      <div key={item.id} className="card  ">
        <div className="card-body p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <img
              src={item.image}
              alt={getLocalizedText(item.name, currentLang)}
              className="w-full sm:w-24 h-24 rounded object-cover flex-shrink-0"
            />

            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-xl text-gray-900 mb-2">
                {getLocalizedText(item.name, currentLang)}
              </h3>

              {/* Display selected options */}
              {selectedOptionsDetails && selectedOptionsDetails.length > 0 && (
                <div className="mb-3 p-3 bg-gray-50 rounded-lg border-l-4 border-primary">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">
                    {t("publicMenu.selectedOptions")}
                  </h4>
                  <div className="space-y-2">
                    {selectedOptionsDetails.map((option: CartItemOption) => (
                      <div key={option.optionId} className="text-sm">
                        <div className="font-medium text-gray-700 mb-1">
                          {option.optionName[currentLang as "en" | "ar"]}
                        </div>
                        <div className="ml-2 space-y-1">
                          {option.choices.map(
                            (choice: CartItemOption["choices"][number]) => (
                              <div
                                key={choice.choiceId}
                                className="flex justify-between items-center text-xs text-gray-600"
                              >
                                <span>
                                  {
                                    choice.choiceName[
                                      currentLang as "en" | "ar"
                                    ]
                                  }
                                </span>
                                {choice.price > 0 && (
                                  <span className="text-green-600 font-medium">
                                    +{choice.price.toFixed(2)} EGP
                                  </span>
                                )}
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2 text-sm text-gray-700-content mb-4">
                {/* Always show original price */}
                <div className="flex justify-between text-lg">
                  <span>{t("publicMenu.originalPrice")}</span>
                  <span
                    className={`font-medium ${
                      item.discount && item.discount.value > 0
                        ? "line-through text-gray-500"
                        : "text-gray-900"
                    }`}
                  >
                    {item.originalPrice?.toFixed(2) || item.price.toFixed(2)}{" "}
                    EGP
                  </span>
                </div>

                {/* Show discount only if there's a discount */}
                {item.discount &&
                  item.discount.value > 0 &&
                  item.originalPrice && (
                    <div className="flex justify-between text-black">
                      <span className="flex items-center gap-2">
                        {t("publicMenu.disountDisplay")}
                        <span className="bg-warning text-white text-xs px-2 py-1 rounded-full font-medium">
                          {item.discount.value}% OFF
                        </span>
                      </span>
                      <span className="font-medium">
                        {(
                          item.originalPrice -
                          item.originalPrice * (1 - item.discount.value / 100)
                        ).toFixed(2)}{" "}
                        EGP OFF
                      </span>
                    </div>
                  )}

                {/* Show current price (after discount if applicable) */}
                <div className="flex justify-between font-bold text-lg text-primary pt-2 border-t">
                  <span>{t("publicMenu.finalPrice")}</span>
                  <span>{item.price.toFixed(2)} EGP</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-2 sm:gap-3">
                  <button
                    onClick={() =>
                      updateQuantity(
                        item.uniqueId || item.id || "",
                        item.quantity - 1,
                      )
                    }
                    className="btn btn-sm outline-0 border-0 px-2 bg-gray-200 hover:bg-red-500"
                    disabled={item.quantity <= 1}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-12 text-center font-bold text-lg">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() =>
                      updateQuantity(
                        item.uniqueId || item.id || "",
                        item.quantity + 1,
                      )
                    }
                    className="btn btn-sm bg-green-600 text-white outline-0 border-0 px-2 hover:bg-green-400"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between w-full sm:w-auto gap-3">
                  <div className="text-right">
                    <div className="text-lg font-bold text-primary">
                      {(item.price * item.quantity).toFixed(2)} EGP
                    </div>
                    <div className="text-xs text-gray-700-content">
                      {t("publicMenu.totalQuantity")}
                    </div>
                  </div>
                  <button
                    onClick={() => removeItem(item.uniqueId || item.id || "")}
                    className="btn btn-sm bg-red-600 text-white outline-0 border-0  hover:bg-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
