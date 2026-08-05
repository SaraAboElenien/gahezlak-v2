# Screenshots

The root `README.md` embeds the seven files listed below. **Until they exist, GitHub renders broken image icons** — which looks worse than having no screenshots at all. Either add them, or delete the corresponding rows from the Screenshots section.

Capture with both dev servers running (`npm run dev` in `backend/` and `frontend/`), signed in as the seeded test shop.

| Filename                  | View                      | Capture at                                                         | What to show                                                                                                                  |
| ------------------------- | ------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `menu-mobile.png`         | Public menu, `/:shopName` | **Phone width** — DevTools device toolbar, iPhone 14 Pro (393×852) | Categories and a few dishes with photos and prices. This is the product's core moment: a diner who has just scanned the code. |
| `cart.png`                | Cart / order summary      | Phone width                                                        | Two or three items with options selected and a visible running total.                                                         |
| `checkout.png`            | Checkout                  | Phone width                                                        | The payment-method choice — card, mobile wallet, cash.                                                                        |
| `dashboard-orders.png`    | Dashboard → Orders        | **Desktop**, 1440×900                                              | The orders board with several orders in different statuses.                                                                   |
| `dashboard-menu.png`      | Dashboard → Menu          | Desktop, 1440×900                                                  | The menu editor with categories and a few items.                                                                              |
| `dashboard-analytics.png` | Dashboard → Analytics     | Desktop, 1440×900                                                  | Revenue and order-volume charts with data in them.                                                                            |
| `landing.png`             | Landing page, `/`         | Desktop, 1440×900                                                  | Above-the-fold hero.                                                                                                          |

## Getting screenshots worth showing

A few things that make the difference between "screenshots" and screenshots that sell the project:

- **Seed real-looking data first.** Empty states and `test test` dishes read as unfinished. Give the menu a handful of real dish names with photos, and place a few orders so the analytics charts and the orders board are not empty.
- **Use the device toolbar for the phone shots**, not a resized window — you get exact dimensions and clean edges with no browser chrome.
- **Capture one Arabic screenshot.** RTL support is one of this project's genuinely distinguishing features and it is invisible in an all-English set. `menu-mobile.png` is the natural candidate.
- **Hide anything personal** — real email addresses, phone numbers, the Paymob dashboard.
- **Keep each file under 500 KB.** CI enforces this (`.github/workflows/ci.yml` fails the frontend job on any image over the budget), because page weight is a product requirement for a QR-menu product used on mobile data. PNG is fine at these sizes; if one runs large, export as JPEG at ~85% quality and rename the reference in `README.md`.

## Recording a GIF instead

A short animated GIF of the scan → browse → order → pay flow makes a stronger hero than any single still. If you record one, save it as `docs/screenshots/demo.gif`, keep it under ~5 MB, and replace the `landing.png` image in the README's Screenshots section with it.
