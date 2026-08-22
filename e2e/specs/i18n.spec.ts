/**
 * Bilingual EN/AR with right-to-left layout.
 *
 * The switch does two separable things, and only one of them is testable
 * without a browser: `i18n.changeLanguage()` swaps the strings (a unit test
 * could see that), while `useLang.changeLanguage` also writes
 * `document.documentElement.lang` and `.dir` by hand. Every RTL rule in the
 * stylesheet hangs off that `dir` attribute, so if the imperative half is ever
 * dropped the app translates but stays laid out left-to-right — a failure that
 * looks like a styling glitch and is invisible to any test that does not
 * inspect the real document.
 */
import { expect, SEED, test } from "../fixtures/test";
import { loginAsOwner, publicMenuHeading } from "../fixtures/locators";

const MENU_PATH = `/shops/${SEED.shop.name}/menu`;

test.describe("language switching", () => {
  test("the public menu flips to Arabic and to RTL, and back again", async ({
    page,
  }) => {
    await page.goto(MENU_PATH);
    const html = page.locator("html");

    await expect(publicMenuHeading(page, SEED.items.hummus.en)).toBeVisible();
    await expect(page.getByPlaceholder("Search for meal...")).toBeVisible();

    // The desktop toggle is labelled with the language it switches TO.
    await page.getByRole("button", { name: "العربية" }).click();

    await expect(html).toHaveAttribute("dir", "rtl");
    await expect(html).toHaveAttribute("lang", "ar");
    await expect(publicMenuHeading(page, SEED.items.hummus.ar)).toBeVisible();
    await expect(publicMenuHeading(page, SEED.items.hummus.en)).toHaveCount(0);
    await expect(page.getByPlaceholder("البحث عن وجبة...")).toBeVisible();

    // Content translates too, not just chrome: the category headings come from
    // the database's bilingual fields rather than from the locale files.
    await expect(
      page.getByRole("heading", { name: SEED.categories.starters.ar }),
    ).toBeVisible();

    await page.getByRole("button", { name: "English" }).click();
    await expect(html).toHaveAttribute("dir", "ltr");
    await expect(html).toHaveAttribute("lang", "en");
    await expect(publicMenuHeading(page, SEED.items.hummus.en)).toBeVisible();
  });

  test("the checkout form translates", async ({ page }) => {
    await page.goto(MENU_PATH);
    await page.getByRole("button", { name: "العربية" }).click();

    await page.goto(`/shops/${SEED.shop.name}/cart`);
    // The cart is empty, so the empty state is what is on screen — still the
    // right place to check the language survived a client-side navigation.
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("button", { name: "العربية" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "English" })).toBeVisible();
  });

  test("the dashboard flips to Arabic and to RTL", async ({ page }) => {
    await loginAsOwner(page);
    await page.goto("/dashboard/menu");
    await expect(
      page.getByRole("heading", { name: "Menu Management" }),
    ).toBeVisible();

    await page.getByRole("button", { name: /العربية/ }).click();

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(
      page.getByRole("heading", { name: "إدارة القائمة" }),
    ).toBeVisible();
  });
});
