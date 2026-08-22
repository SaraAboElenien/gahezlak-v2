/**
 * Shared locators for structures the app renders without an addressable
 * container.
 *
 * A public menu card and a dashboard item card are both anonymous `<div>`s
 * whose only stable, meaningful anchor is the heading inside them. Playwright
 * can find the heading by role, but "the Add button belonging to *this* dish"
 * then needs one DOM hop up. That hop is what these helpers isolate: it lives
 * in one place, so if the markup ever gains a real landmark (an `<article>`,
 * or a `data-testid`) exactly one file changes rather than every spec.
 */
import { expect, type Locator, type Page } from "@playwright/test";
import { SEED } from "../harness/config";

/**
 * Signs the seeded owner in through the real login form.
 *
 * Deliberately not a saved `storageState`: the access token is held in memory
 * (never in localStorage), so there is nothing for Playwright to serialise —
 * the only durable part of the session is the httpOnly refresh cookie, and
 * exercising the form is what proves that cookie is issued correctly in the
 * first place. Logging in costs about a second at the seed's bcrypt cost.
 */
export async function loginAsOwner(page: Page): Promise<void> {
  await page.goto("/auth");
  await page.getByLabel("Email", { exact: true }).fill(SEED.owner.email);
  await page.getByLabel("Password", { exact: true }).fill(SEED.owner.password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/overview$/);
}

/**
 * A card on the PUBLIC menu (`components/menu/ProductCard.tsx`), scoped to the
 * block that holds the title, description, price and Add button.
 */
export function publicMenuCard(page: Page, itemName: string): Locator {
  return page
    .getByRole("heading", { name: itemName, exact: true, level: 2 })
    .locator("..");
}

/**
 * A card in the DASHBOARD menu manager (`components/menu-management/ItemCard.tsx`),
 * scoped to the block that holds the title and the Edit/Delete buttons.
 */
export function dashboardMenuCard(page: Page, itemName: string): Locator {
  return page
    .getByRole("heading", { name: itemName, exact: true, level: 4 })
    .locator("../..");
}

/**
 * A dish heading on the public menu.
 *
 * `level: 2` is load-bearing, not decoration: `BannerSlider` renders every
 * dish's name a second time as an `<h3>`, so an unlevelled `getByRole
 * ("heading")` matches twice and fails Playwright's strict mode.
 */
export function publicMenuHeading(page: Page, itemName: string): Locator {
  return page.getByRole("heading", { name: itemName, exact: true, level: 2 });
}

/**
 * The header's cart link.
 *
 * `.first()` is unavoidable here and worth explaining. `ShopLayout` renders the
 * same "Cart" link twice: once in `MenuNavbar` and once in the off-canvas
 * `Sidebar`. When that sidebar is closed it is only pushed off-screen with a
 * CSS transform — it is not `display: none`, `aria-hidden` or `inert` — so both
 * links are present, both are visible to Playwright, and their accessible names
 * are identical. (That is also a real accessibility problem: the closed
 * drawer's links stay in the tab order.) DOM order puts the navbar first.
 */
export function cartLink(page: Page): Locator {
  return page.getByRole("link", { name: /^Cart/ }).first();
}

/**
 * The public menu's category `<select>`.
 *
 * Addressed by its id because the control has no `<label>` and the page holds
 * a second, visually identical `<select>` for sorting — so `getByRole
 * ("combobox")` is ambiguous and index-based disambiguation would break the
 * moment a third filter appears. The id is the app's own, not a test hook.
 */
export function categoryFilter(page: Page): Locator {
  return page.locator("select#categorySelect");
}
