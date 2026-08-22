/**
 * The customer journey: scan a QR code, browse a menu, order, pay in person.
 *
 * This is the product's whole reason to exist and, until now, the only way it
 * had ever been checked was by hand. It crosses every layer the app has —
 * public (unauthenticated) API, React Query cache, cart state in localStorage,
 * option pricing computed twice (client for display, server for the money),
 * an order number allocated inside a MongoDB transaction, and a redirect onto
 * a route guarded by localStorage timestamps.
 */
import { expect, SEED, test } from "../fixtures/test";
import {
  cartLink,
  categoryFilter,
  publicMenuCard,
  publicMenuHeading,
} from "../fixtures/locators";

const MENU_PATH = `/shops/${SEED.shop.name}/menu`;

test.describe("customer ordering", () => {
  test("public menu lists available dishes and hides unavailable ones", async ({
    page,
  }) => {
    await page.goto(MENU_PATH);

    // Scoped to the menu container: the shop name is rendered as an <h1> twice
    // on this page — once in the sticky navbar and once as the page title — so
    // an unscoped query is ambiguous. (Two <h1>s on one document is itself a
    // small SEO/accessibility smell, but it is the app's markup, not the test's
    // problem to fix.)
    await expect(
      page.locator("#demo").getByRole("heading", {
        name: SEED.shop.name,
        level: 1,
      }),
    ).toBeVisible();
    await expect(page).toHaveTitle(new RegExp(SEED.shop.name));

    await expect(publicMenuHeading(page, SEED.items.hummus.en)).toBeVisible();
    await expect(publicMenuHeading(page, SEED.items.grill.en)).toBeVisible();

    // `isAvailable: false`. A customer must never be offered a dish the
    // kitchen has switched off — and the backend refuses to put one in an
    // order, so showing it would produce a checkout that simply fails.
    await expect(publicMenuHeading(page, SEED.items.soldOut.en)).toHaveCount(0);
  });

  test("search and category filters narrow the menu", async ({ page }) => {
    await page.goto(MENU_PATH);
    await expect(publicMenuHeading(page, SEED.items.hummus.en)).toBeVisible();

    const search = page.getByPlaceholder("Search for meal...");
    await search.fill("koshary");
    await expect(publicMenuHeading(page, SEED.items.koshary.en)).toBeVisible();
    await expect(publicMenuHeading(page, SEED.items.hummus.en)).toHaveCount(0);

    await search.clear();
    await expect(publicMenuHeading(page, SEED.items.hummus.en)).toBeVisible();

    await categoryFilter(page).selectOption({
      label: SEED.categories.drinks.en,
    });
    await expect(publicMenuHeading(page, SEED.items.lemonade.en)).toBeVisible();
    await expect(publicMenuHeading(page, SEED.items.hummus.en)).toHaveCount(0);
  });

  test("a dish with a required option cannot be added until it is chosen", async ({
    page,
  }) => {
    await page.goto(MENU_PATH);

    await publicMenuCard(page, SEED.items.grill.en)
      .getByRole("button", { name: "Add", exact: true })
      .click();

    const dialog = page.getByRole("dialog", { name: SEED.items.grill.en });
    await expect(dialog).toBeVisible();

    const addToCart = dialog.getByRole("button", { name: "Add to Cart" });
    await expect(addToCart).toBeDisabled();
    await expect(
      dialog.getByText("Please select required options"),
    ).toBeVisible();

    await dialog.getByRole("radio", { name: /Egyptian rice/ }).check();
    await expect(addToCart).toBeEnabled();
  });

  test("browse -> customise -> cart -> cash checkout creates a real order", async ({
    page,
    control,
  }) => {
    await page.goto(MENU_PATH);

    // --- Add a customised dish -------------------------------------------
    await publicMenuCard(page, SEED.items.grill.en)
      .getByRole("button", { name: "Add", exact: true })
      .click();

    const dialog = page.getByRole("dialog", { name: SEED.items.grill.en });
    await dialog.getByRole("radio", { name: /French fries/ }).check();
    await dialog.getByRole("checkbox", { name: /Extra cheese/ }).check();
    await dialog.getByRole("button", { name: "+", exact: true }).click();

    // 250 base + 15 fries + 20 cheese = 285 each, x2.
    await expect(dialog.getByText("Total: 570.00 EGP")).toBeVisible();
    await dialog.getByRole("button", { name: "Add to Cart" }).click();
    await expect(dialog).toHaveCount(0);

    // --- Cart -------------------------------------------------------------
    await cartLink(page).click();
    await expect(page).toHaveURL(new RegExp(`/shops/${SEED.shop.name}/cart$`));
    await expect(
      page.getByRole("heading", { name: /Cart items \(1\)/ }),
    ).toBeVisible();
    await expect(page.getByText("570.00 EGP").first()).toBeVisible();

    // --- Checkout form ----------------------------------------------------
    await page.getByLabel(/First Name/).fill("Sara");
    await page.getByLabel(/Last Name/).fill("Customer");
    await page.getByLabel(/Phone Number/).fill("01011122233");
    await page.getByRole("radio", { name: "Dine In" }).check();
    await page.getByLabel(/Table Number/).fill("7");
    await page.getByRole("radio", { name: "Cash", exact: true }).check();
    await page
      .getByLabel(/Special Instructions/)
      .fill("No coriander on the grill, please.");

    await page.getByRole("button", { name: "Checkout" }).click();

    // --- Confirmation -----------------------------------------------------
    await expect(page).toHaveURL(
      new RegExp(`/shops/${SEED.shop.name}/orders/checkout/\\d+$`),
    );
    // Cash is settled in person, so the app never sends the customer to
    // Paymob — it goes straight to "pay at the till".
    await expect(
      page.getByText("Order is pending please go to cashier"),
    ).toBeVisible();

    const orderNumber = Number(page.url().split("/").pop());
    expect(Number.isFinite(orderNumber)).toBe(true);

    // --- And it is genuinely persisted, priced by the SERVER --------------
    const order = await control.order(orderNumber);
    expect(order.orderStatus).toBe("Pending");
    expect(order.paymentMethod).toBe("Cash");
    expect(order.tableNumber).toBe(7);
    expect(order.customerFirstName).toBe("Sara");
    expect(order.customerPhoneNumber).toBe("01011122233");
    expect(order.totalAmount).toBe(570);
    expect(order.orderItems).toHaveLength(1);
    expect(order.orderItems[0].quantity).toBe(2);
    expect(order.orderItems[0].price).toBe(285);
  });

  test("a discounted dish is charged at its discounted price", async ({
    page,
    control,
  }) => {
    await page.goto(MENU_PATH);

    await publicMenuCard(page, SEED.items.koshary.en)
      .getByRole("button", { name: "Add", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: SEED.items.koshary.en });
    await dialog.getByRole("button", { name: "Add to Cart" }).click();

    await page.goto(`/shops/${SEED.shop.name}/cart`);
    await page.getByLabel(/First Name/).fill("Dina");
    await page.getByLabel(/Last Name/).fill("Discount");
    await page.getByLabel(/Phone Number/).fill("01011122244");
    await page.getByRole("radio", { name: "Takeaway" }).check();
    await page.getByRole("radio", { name: "Cash", exact: true }).check();
    await page.getByRole("button", { name: "Checkout" }).click();

    await expect(page).toHaveURL(/orders\/checkout\/\d+$/);
    const order = await control.order(Number(page.url().split("/").pop()));
    // 100 less 20% — asserted against the database, not the rendered price,
    // because the server recomputes it and the server is what bills.
    expect(order.totalAmount).toBe(80);
    expect(order.tableNumber).toBeUndefined();
  });
});
