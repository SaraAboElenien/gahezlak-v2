import { createContext } from "react";
import { type CartItem } from "../types/validations/menu/menu";
import { type MenuItem as ApiMenuItem } from "../types/menuItem";
import { type CustomerFormData } from "@/types/validations/shop/customerSchema";

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (
    menuItem: ApiMenuItem,
    quantity?: number,
    selectedOptions?: { [optionId: string]: string[] },
  ) => void;
  updateQuantity: (id: string, quantity: number) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  clearCartWithToast: () => void;
  getTotalItemsCount: () => number;
  getSubtotal: () => number;
  // getTotalVat: () => number;
  getTotalDiscount: () => number;
  getTotal: () => number;
  getFinalTotal: () => number;
  handleCheckout: (
    customerData: CustomerFormData,
    shopName: string,
  ) => Promise<{ iframeUrl: string }>; //!!!!!!Updated return type
  addToFavs: (product: ApiMenuItem) => void;
  favourites: ApiMenuItem[];
  currentShopSlug: string | null;
}

export const CartContext = createContext<CartContextType | undefined>(
  undefined,
);
