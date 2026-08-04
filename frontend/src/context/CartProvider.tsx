import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";
import {
  type CartItem,
  type CartItemOption,
} from "../types/validations/menu/menu";
import { type MenuItem as ApiMenuItem } from "../types/menuItem";
import toast from "react-hot-toast";
import { useLang } from "../hooks/useLang";
import { useTranslation } from "react-i18next";
import { useCreateOrder } from "@/hooks/useOrder";
import type { CreateOrderRequest } from "../types/order";
import {
  getFinalPrice,
  calculatePricePerItem,
} from "../utils/priceCalculations";
import { useLocation } from "react-router-dom";
import { CartContext } from "./CartContext.context";
import { type CustomerFormData } from "@/types/validations/shop/customerSchema";

interface CartProviderProps {
  children: ReactNode;
}

export const CartProvider: React.FC<CartProviderProps> = ({ children }) => {
  const location = useLocation();

  // TODO: extract the shop name from the URL
  const currentShopSlug = location.pathname.split("/")[2] || "demo"; // Extract shop slug from pathname

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [favourites, setFavourites] = useState<ApiMenuItem[]>([]);

  const { currentLang } = useLang();
  const { t } = useTranslation();
  const createOrderMutation = useCreateOrder();

  // TODO: Load cart items for current shop when shop changes from localstorage
  useEffect(() => {
    // get cart data from the browser’s localStorage -> If it exists, parse it into an array. Otherwise, use an empty array.
    if (currentShopSlug && currentShopSlug !== "demo") {
      const savedCart = localStorage.getItem(`cartItems_${currentShopSlug}`);
      const newCartItems = savedCart ? JSON.parse(savedCart) : [];

      //Migrate existing cart items to include uniqueId -> If uniqueId is missing, create one based on item ID and selected options.
      //this is for localstorage
      const migratedCartItems = newCartItems.map((item: CartItem) => {
        // Migrate uniqueId if missing
        let uniqueId = item.uniqueId;
        if (!item.uniqueId) {
          const optionsKey = item.selectedOptions
            ? JSON.stringify(item.selectedOptions)
            : "no-options";
          uniqueId = `${item.id}-${optionsKey}`;
        }

        // Migrate name from string to LocalizedText if needed
        let name = item.name;
        if (typeof item.name === "string") {
          // If name is a string, we need to create a LocalizedText object
          // We'll use the string as both English and Arabic for now
          name = {
            en: item.name,
            ar: item.name,
          };
        }

        return { ...item, uniqueId, name };
      });

      //update state with loaded cart items
      setCartItems(migratedCartItems);
    } else {
      setCartItems([]);
    }
  }, [currentShopSlug, currentLang]);

  // Load favourites for current shop when shop changes
  useEffect(() => {
    // Reset favourites when shop changes - no localStorage persistence
    setFavourites([]);
  }, [currentShopSlug]);

  //TODO: SAVE cart items to localStorage whenever they change or shops change
  useEffect(() => {
    if (currentShopSlug && cartItems.length > 0) {
      localStorage.setItem(
        `cartItems_${currentShopSlug}`,
        JSON.stringify(cartItems),
      );
    } else if (currentShopSlug && cartItems.length === 0) {
      localStorage.removeItem(`cartItems_${currentShopSlug}`);
    }
  }, [cartItems, currentShopSlug]);

  //TODO: ADDS MENU ITEMS TO CART -> If it’s already there (same item with same options), it just increases the quantity.
  const addToCart = useCallback(
    (
      menuItem: ApiMenuItem,
      quantity: number = 1,
      selectedOptions?: { [optionId: string]: string[] },
    ) => {
      if (!currentShopSlug) {
        toast.error("Please select a shop to add items to cart");
        return;
      }

      setCartItems((prev) => {
        // Create a unique identifier that includes both menu item ID and selected options
        const optionsKey = selectedOptions
          ? JSON.stringify(selectedOptions)
          : "no-options";

        const uniqueId = `${menuItem._id}-${optionsKey}`;

        const existingItem = prev.find((item) => {
          // Check if this is the same item with the same options
          const itemOptionsKey = item.selectedOptions
            ? JSON.stringify(item.selectedOptions)
            : "no-options";
          const itemUniqueId = `${item.id}-${itemOptionsKey}`;
          return itemUniqueId === uniqueId;
        });

        if (existingItem) {
          toast.success(t("publicMenu.itemAddedToCart"));
          return prev.map((item) => {
            const itemOptionsKey = item.selectedOptions
              ? JSON.stringify(item.selectedOptions)
              : "no-options";
            const itemUniqueId = `${item.id}-${itemOptionsKey}`;
            return itemUniqueId === uniqueId
              ? { ...item, quantity: item.quantity + quantity }
              : item;
          });
        } else {
          // Calculate the actual price including discount and options
          const actualPrice = selectedOptions
            ? calculatePricePerItem(menuItem, selectedOptions)
            : getFinalPrice(menuItem);

          // Original price should be the base menu item price (without discount)
          const originalPrice = menuItem.price;

          // Create detailed option information for display
          const selectedOptionsDetails: CartItemOption[] = [];
          if (selectedOptions && menuItem.options) {
            Object.entries(selectedOptions).forEach(([optionId, choiceIds]) => {
              const option = menuItem.options?.find(
                (opt) => opt._id === optionId,
              );
              if (option) {
                const choices = choiceIds
                  .map((choiceId) => {
                    const choice = option.choices.find(
                      (c) => c._id === choiceId,
                    );
                    return {
                      choiceId,
                      choiceName: choice?.name || { en: "", ar: "" },
                      price: choice?.price || 0,
                    };
                  })
                  .filter(
                    (choice) => choice.choiceName.en || choice.choiceName.ar,
                  );

                if (choices.length > 0) {
                  selectedOptionsDetails.push({
                    optionId,
                    optionName: option.name,
                    choices,
                  });
                }
              }
            });
          }

          const newCartItem: CartItem = {
            id: menuItem._id || "",
            name: menuItem.name, // Store the full LocalizedText object
            price: actualPrice,
            quantity: quantity,
            image: menuItem.imgUrl,
            // vat: actualPrice * 0.14,
            discount:
              menuItem.discountPercentage && menuItem.discountPercentage > 0
                ? {
                    type: "percentage",
                    value: menuItem.discountPercentage,
                    active: true,
                  }
                : undefined,
            originalPrice: originalPrice,
            selectedOptions: selectedOptions,
            selectedOptionsDetails:
              selectedOptionsDetails.length > 0
                ? selectedOptionsDetails
                : undefined,
            customizationDetails: selectedOptions
              ? JSON.stringify(selectedOptions)
              : undefined,
            uniqueId: uniqueId, // Store the unique identifier
            categoryId: menuItem.categoryId,
            available: menuItem.isAvailable,
          };
          toast.success(t("publicMenu.itemAddedToCart"));
          return [...prev, newCartItem];
        }
      });
    },
    [currentShopSlug, t],
  );

  const updateQuantity = useCallback((uniqueId: string, quantity: number) => {
    if (quantity < 1) return;
    setCartItems((prev) =>
      prev.map((item) =>
        item.uniqueId === uniqueId ? { ...item, quantity } : item,
      ),
    );
  }, []);

  const removeItem = useCallback(
    (uniqueId: string) => {
      setCartItems((prev) => prev.filter((item) => item.uniqueId !== uniqueId));
      toast.success(t("publicMenu.itemRemovedFromCart"));
    },
    [t],
  );

  const clearCart = useCallback(() => {
    setCartItems([]);
    if (currentShopSlug) {
      localStorage.removeItem(`cartItems_${currentShopSlug}`);
    }
  }, [currentShopSlug]);

  const clearCartWithToast = useCallback(() => {
    clearCart();
    toast.success(t("publicMenu.allItemsRemovedFromCart"));
  }, [clearCart, t]);

  const addToFavs = useCallback((product: ApiMenuItem) => {
    setFavourites((prev) => {
      const existing = prev.find((item) => item._id === product._id);
      if (existing) {
        return prev.filter((item) => item._id !== existing._id);
      }
      return [...prev, product];
    });
  }, []);

  const getTotalItemsCount = useCallback(() => {
    return cartItems.reduce((sum, item) => sum + item.quantity, 0);
  }, [cartItems]);

  const getSubtotal = useCallback(() => {
    return cartItems.reduce((sum, item) => {
      // Use original price for subtotal calculation
      const basePrice = item.originalPrice || item.price;
      return sum + basePrice * item.quantity;
    }, 0);
  }, [cartItems]);

  // const getTotalVat = () => {
  //   return cartItems.reduce(
  //     (sum, item) => sum + (item.vat ?? 0) * item.quantity,
  //     0
  //   );
  // };

  const getTotalDiscount = useCallback(() => {
    return cartItems.reduce((sum, item) => {
      if (item.originalPrice && item.originalPrice > item.price) {
        return sum + (item.originalPrice - item.price) * item.quantity;
      }
      return sum;
    }, 0);
  }, [cartItems]);

  const getTotal = useCallback(() => {
    // Total = Subtotal (original prices) - Total Discount
    return getSubtotal() - getTotalDiscount();
  }, [getSubtotal, getTotalDiscount]);

  const getFinalTotal = useCallback(() => {
    // Final total using discounted prices (for display purposes)
    return cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [cartItems]);

  // !!!! ORDER API
  const handleCheckout = useCallback(
    async (customerData: CustomerFormData, shopName: string) => {
      try {
        const orderItems = cartItems.map((item) => ({
          menuItem: item.id || "", // Provide fallback for undefined id
          quantity: item.quantity,
          customizationDetails: customerData.customizationDetails, // User-entered special instructions from textarea
          selectedOptions: item.selectedOptions
            ? Object.entries(item.selectedOptions).map(
                ([optionId, choiceIds]) => ({
                  optionId,
                  choiceIds,
                }),
              )
            : [],
        }));

        const orderData: CreateOrderRequest = {
          customerFirstName: customerData.firstName,
          customerLastName: customerData.lastName,
          customerPhoneNumber: customerData.phone,
          paymentMethod: customerData.paymentMethod,
          shopName: shopName,
          orderItems: orderItems,
          tableNumber: customerData.tableNumber || undefined,
        };

        const response = await createOrderMutation.mutateAsync(orderData);

        // Store order number in localStorage for success page and tracking
        localStorage.setItem(
          "lastOrderNumber",
          response.data.orderNumber.toString(),
        );
        localStorage.setItem("lastOrderTimestamp", Date.now().toString());

        // Return the iframeUrl from the response data
        return { iframeUrl: response.data.iframeUrl };
      } catch (error) {
        console.error("Error creating order:", error);
        const errorMessage =
          currentLang === "ar"
            ? "حدث خطأ أثناء إنشاء الطلب. يرجى المحاولة مرة أخرى."
            : "An error occurred while creating the order. Please try again.";
        toast.error(errorMessage);
        throw error; // Re-throw to handle in component
      }
      // cartItems is a real dependency, not just lint noise: without it this
      // callback kept whatever cart snapshot existed when it was last
      // memoized (recreated only on currentLang/createOrderMutation changes,
      // not on add/remove/update), so a customer could submit a stale cart on
      // checkout after editing it post-memoization.
    },
    [currentLang, createOrderMutation, cartItems],
  );

  const value = useMemo(
    () => ({
      cartItems,
      addToCart,
      updateQuantity,
      removeItem,
      clearCart,
      clearCartWithToast,
      getTotalItemsCount,
      getSubtotal,
      // getTotalVat
      getTotalDiscount,
      getTotal,
      getFinalTotal,
      handleCheckout,
      addToFavs,
      favourites,
      currentShopSlug,
    }),
    [
      cartItems,
      addToCart,
      updateQuantity,
      removeItem,
      clearCart,
      clearCartWithToast,
      getTotalItemsCount,
      getSubtotal,
      getTotalDiscount,
      getTotal,
      getFinalTotal,
      handleCheckout,
      addToFavs,
      favourites,
      currentShopSlug,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
