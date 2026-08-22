/**
 * The shop owner's menu manager: create, edit and delete a dish, and see the
 * change reach the customer-facing menu.
 *
 * The last part is the point. Dashboard and public menu are two different
 * routes, two different API endpoints (`/shops/menu-items` authenticated vs
 * `/shops/name/:shopName/menu-items` public) and two different React Query
 * caches. A change that saves but never surfaces to diners is the failure mode
 * that matters, and nothing below the browser can catch it.
 */
import { expect, SEED, test } from "../fixtures/test";
import {
  dashboardMenuCard,
  loginAsOwner,
  publicMenuHeading,
} from "../fixtures/locators";

const DISH = {
  en: "Feteer Meshaltet",
  ar: "فطير مشلتت",
  price: "120",
  descriptionEn: "Layered Egyptian pastry served with honey and cream",
  descriptionAr: "فطير مشلتت يقدم مع العسل والقشطة",
};

async function openMenuItemsTab(page: import("@playwright/test").Page) {
  await page.goto("/dashboard/menu");
  await expect(
    page.getByRole("heading", { name: "Menu Management" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Menu Items/ }).click();
}

test.describe("owner menu management", () => {
  /**
   * REGRESSION TEST — this was written as an expected failure and is now the
   * proof of the fix.
   *
   * A new dish could not be created from the dashboard at all. Two defects
   * compounded, and either one alone was enough to block it:
   *
   *   1. `MenuItemForm` resets `image` to `""` for a new item, but
   *      `menuItemSchema.image` was `z.union([url, FileList]).optional()`. An
   *      empty string satisfied neither branch and `.optional()` permits only
   *      `undefined`, so the form rejected itself with "Image is required"
   *      before anything was sent. `z.literal("")` is now part of the union.
   *   2. Attaching a photo did not help. `ItemImageSection` spread
   *      `{...register("image")}` and then declared `onChange={handleImageChange}`
   *      *after* it, replacing react-hook-form's own change handler — so RHF
   *      never saw the FileList and the value stayed `""`. The two handlers are
   *      now composed.
   *
   * The backend never agreed with any of it: `imgUrl` is `.optional()` there,
   * `ItemCard` renders a "No image" placeholder, and `seed-menu.ts` seeds 41
   * dishes with no images on purpose. The same bug also blocked *editing* any
   * dish that had no image.
   */
  test("create a dish, and it appears on the public menu", async ({ page }) => {
    await loginAsOwner(page);
    await openMenuItemsTab(page);

    await page.getByRole("button", { name: "Add Item" }).click();

    const dialog = page.getByRole("dialog", { name: "Add New Menu Item" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Name (English)").fill(DISH.en);
    await dialog.getByLabel("Name (Arabic)").fill(DISH.ar);
    await dialog.getByLabel("Description (English)").fill(DISH.descriptionEn);
    await dialog.getByLabel("Description (Arabic)").fill(DISH.descriptionAr);
    await dialog.getByLabel("Price").fill(DISH.price);
    await dialog
      .getByLabel("Category")
      .selectOption({ label: SEED.categories.starters.en });

    // A photo is attached even though the journey does not require one, so
    // that this test exercises the realistic path and not just the
    // no-image path. Reached by its label: the input carried `id="image"`
    // while both surrounding labels pointed at "item-image", so nothing was
    // associated with the control — a third, smaller accessibility defect,
    // fixed with the other two. Using the label here is what keeps it fixed.
    await dialog.getByLabel("Item Image").setInputFiles({
      name: "dish.gif",
      mimeType: "image/gif",
      buffer: Buffer.from(
        "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        "base64",
      ),
    });

    await dialog.getByRole("button", { name: "Add", exact: true }).click();

    await expect(page.getByText("Item created successfully!")).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: DISH.en, exact: true, level: 4 }),
    ).toBeVisible();

    // The customer's view of the same shop, fetched through the public API.
    await page.goto(`/shops/${SEED.shop.name}/menu`);
    await expect(publicMenuHeading(page, DISH.en)).toBeVisible();
    await expect(page.getByText(`${DISH.price} EGP`).first()).toBeVisible();
  });

  test("edit a dish's price and description", async ({ page }) => {
    await loginAsOwner(page);
    await openMenuItemsTab(page);

    await dashboardMenuCard(page, SEED.items.hummus.en)
      .getByRole("button", { name: "Edit" })
      .click();

    const dialog = page.getByRole("dialog", { name: "Edit Menu Item" });
    await expect(dialog).toBeVisible();
    // The form is populated from the item, not blank — an edit form that
    // silently drops fields it did not render is a defect this project has
    // already shipped once.
    await expect(dialog.getByLabel("Name (English)")).toHaveValue(
      SEED.items.hummus.en,
    );
    await expect(dialog.getByLabel("Name (Arabic)")).toHaveValue(
      SEED.items.hummus.ar,
    );

    await dialog.getByLabel("Price").fill("70");
    await dialog
      .getByLabel("Description (English)")
      .fill("Now with extra olive oil");
    await dialog.getByRole("button", { name: "Update" }).click();

    await expect(page.getByText("Item updated successfully!")).toBeVisible();
    await expect(
      dashboardMenuCard(page, SEED.items.hummus.en).getByText("70.00 EGP"),
    ).toBeVisible();

    // And the change is real, not just optimistic UI: reload from the server.
    await page.reload();
    await page.getByRole("button", { name: /^Menu Items/ }).click();
    await expect(
      dashboardMenuCard(page, SEED.items.hummus.en).getByText("70.00 EGP"),
    ).toBeVisible();

    await page.goto(`/shops/${SEED.shop.name}/menu`);
    await expect(
      page.getByText("Now with extra olive oil").first(),
    ).toBeVisible();
  });

  test("delete a dish, and it disappears from the public menu", async ({
    page,
  }) => {
    await loginAsOwner(page);
    await openMenuItemsTab(page);

    await dashboardMenuCard(page, SEED.items.lemonade.en)
      .getByRole("button", { name: "Delete" })
      .click();

    // SweetAlert2 renders its own confirmation dialog outside the React tree.
    await page.getByRole("button", { name: "Yes, delete it!" }).click();

    await expect(
      page.getByRole("heading", {
        name: SEED.items.lemonade.en,
        exact: true,
        level: 4,
      }),
    ).toHaveCount(0);

    await page.goto(`/shops/${SEED.shop.name}/menu`);
    await expect(publicMenuHeading(page, SEED.items.lemonade.en)).toHaveCount(
      0,
    );
    await expect(publicMenuHeading(page, SEED.items.hummus.en)).toBeVisible();
  });

  test("the dashboard lists unavailable dishes the public menu hides", async ({
    page,
  }) => {
    await loginAsOwner(page);
    await openMenuItemsTab(page);

    // The owner needs to see a switched-off dish in order to switch it back on;
    // the customer must not see it at all. Same data, two deliberately
    // different views — easy to break by "fixing" either endpoint's filter.
    await expect(
      page.getByRole("heading", {
        name: SEED.items.soldOut.en,
        exact: true,
        level: 4,
      }),
    ).toBeVisible();
    await expect(
      dashboardMenuCard(page, SEED.items.soldOut.en).getByText("Unavailable"),
    ).toBeVisible();
  });
});
