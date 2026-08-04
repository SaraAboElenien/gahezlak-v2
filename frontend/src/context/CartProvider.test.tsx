import { act, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CartProvider } from "@/context/CartProvider";
import { useCart } from "@/hooks/use-cart";
import type { MenuItem } from "@/types/menuItem";

// CartProvider's handleCheckout calls useCreateOrder() to hit the real
// order API — mock it so the provider can be rendered in isolation.
const mutateAsyncMock = vi.fn();
vi.mock("@/hooks/useOrder", () => ({
  useCreateOrder: () => ({
    mutateAsync: mutateAsyncMock,
  }),
}));

type CartApi = ReturnType<typeof useCart>;

let cartApi: CartApi | undefined;

function CartConsumer() {
  cartApi = useCart();
  return null;
}

function getCartApi(): CartApi {
  if (!cartApi) {
    throw new Error("CartProvider consumer has not rendered yet");
  }
  return cartApi;
}

function renderCartProvider() {
  render(
    <MemoryRouter initialEntries={["/shops/test-bistro/menu"]}>
      <CartProvider>
        <CartConsumer />
      </CartProvider>
    </MemoryRouter>,
  );
}

const baseMenuItem: MenuItem = {
  _id: "item-1",
  name: { en: "Burger", ar: "برجر" },
  description: { en: "Tasty burger", ar: "برجر لذيذ" },
  price: 100,
  categoryId: "cat-1",
  isAvailable: true,
  imgUrl: "https://example.com/burger.png",
  discountPercentage: 10,
  options: [
    {
      _id: "opt-size",
      name: { en: "Size", ar: "الحجم" },
      type: "single",
      required: true,
      choices: [
        { _id: "choice-small", name: { en: "Small", ar: "صغير" }, price: 0 },
        { _id: "choice-large", name: { en: "Large", ar: "كبير" }, price: 20 },
      ],
    },
  ],
};

const noDiscountMenuItem: MenuItem = {
  _id: "item-2",
  name: { en: "Fries", ar: "بطاطس" },
  description: { en: "Crispy fries", ar: "بطاطس مقرمشة" },
  price: 30,
  categoryId: "cat-1",
  isAvailable: true,
  imgUrl: "https://example.com/fries.png",
};

beforeEach(() => {
  localStorage.clear();
  mutateAsyncMock.mockReset();
  cartApi = undefined;
});

describe("CartProvider", () => {
  it("increments quantity instead of duplicating when the same item + options is added twice", () => {
    renderCartProvider();

    act(() => {
      getCartApi().addToCart(baseMenuItem, 1, { "opt-size": ["choice-small"] });
    });
    act(() => {
      getCartApi().addToCart(baseMenuItem, 2, { "opt-size": ["choice-small"] });
    });

    const api = getCartApi();
    expect(api.cartItems).toHaveLength(1);
    expect(api.cartItems[0].quantity).toBe(3);
    expect(api.getTotalItemsCount()).toBe(3);
  });

  it("creates a separate cart line when selectedOptions differ for the same item", () => {
    renderCartProvider();

    act(() => {
      getCartApi().addToCart(baseMenuItem, 1, { "opt-size": ["choice-small"] });
    });
    act(() => {
      getCartApi().addToCart(baseMenuItem, 1, { "opt-size": ["choice-large"] });
    });

    const api = getCartApi();
    expect(api.cartItems).toHaveLength(2);
    const uniqueIds = api.cartItems.map((item) => item.uniqueId);
    expect(new Set(uniqueIds).size).toBe(2);
  });

  it("computes getSubtotal, getTotalDiscount and getTotal correctly for a discounted item plus a paid option", () => {
    renderCartProvider();

    // price 100, discountPercentage 10% -> discounted unit price 90.
    // With the "Large" option (+20), unit price = 110; originalPrice stays 100
    // (originalPrice is the item's base price only, not option-inclusive).
    act(() => {
      getCartApi().addToCart(baseMenuItem, 2, { "opt-size": ["choice-large"] });
    });

    const api = getCartApi();
    // Subtotal uses originalPrice (100) * quantity (2) = 200.
    expect(api.getSubtotal()).toBe(200);
    // getTotalDiscount only counts lines where originalPrice > price; here
    // price (110, option-inclusive) exceeds originalPrice (100), so it's 0.
    expect(api.getTotalDiscount()).toBe(0);
    // getTotal = getSubtotal() - getTotalDiscount() = 200 - 0 = 200.
    expect(api.getTotal()).toBe(200);
  });

  it("computes getSubtotal/getTotalDiscount/getTotal correctly for a plain discounted item with no options", () => {
    renderCartProvider();

    act(() => {
      getCartApi().addToCart(baseMenuItem, 2); // no options -> unit price = 90 (100 - 10%)
    });

    const api = getCartApi();
    expect(api.getSubtotal()).toBe(200); // originalPrice 100 * 2
    expect(api.getTotalDiscount()).toBe(20); // (100 - 90) * 2
    expect(api.getTotal()).toBe(180); // 200 - 20
  });

  it("computes totals correctly for an item without a discount", () => {
    renderCartProvider();

    act(() => {
      getCartApi().addToCart(noDiscountMenuItem, 3);
    });

    const api = getCartApi();
    expect(api.getSubtotal()).toBe(90); // 30 * 3
    expect(api.getTotalDiscount()).toBe(0);
    expect(api.getTotal()).toBe(90);
  });

  it("removeItem removes only the targeted cart line", () => {
    renderCartProvider();

    act(() => {
      getCartApi().addToCart(baseMenuItem, 1, { "opt-size": ["choice-small"] });
    });
    act(() => {
      getCartApi().addToCart(noDiscountMenuItem, 1);
    });
    expect(getCartApi().cartItems).toHaveLength(2);

    const targetId = getCartApi().cartItems.find(
      (item) => item.id === noDiscountMenuItem._id,
    )!.uniqueId!;

    act(() => {
      getCartApi().removeItem(targetId);
    });

    const api = getCartApi();
    expect(api.cartItems).toHaveLength(1);
    expect(api.cartItems[0].id).toBe(baseMenuItem._id);
  });

  it("clearCart empties the cart", () => {
    renderCartProvider();

    act(() => {
      getCartApi().addToCart(baseMenuItem, 1);
    });
    act(() => {
      getCartApi().addToCart(noDiscountMenuItem, 1);
    });
    expect(getCartApi().cartItems).toHaveLength(2);

    act(() => {
      getCartApi().clearCart();
    });

    const api = getCartApi();
    expect(api.cartItems).toHaveLength(0);
    expect(api.getTotalItemsCount()).toBe(0);
  });
});
