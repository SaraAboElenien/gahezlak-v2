/**
 * Shared constants for the end-to-end harness.
 *
 * Imported by `playwright.config.ts`, by the harness process (`serve.ts`) and
 * by the specs themselves, so every layer agrees on the same ports and the
 * same seeded fixtures without any of them duplicating a literal.
 *
 * Ports are fixed rather than allocated dynamically for one specific reason:
 * `VITE_API_URL` is inlined into the SPA bundle at *build* time
 * (`frontend/src/config/api.ts`), so the browser's API origin is decided
 * before any test process starts. They are deliberately far from the app's
 * dev defaults (3000 / 5173 / 4173) so an e2e run can never collide with — or
 * silently talk to — a dev server someone left running.
 */

export const BACKEND_PORT = 3100;
export const FRONTEND_PORT = 4100;
/**
 * Test-only control plane (see `control.ts`). Runs inside the harness process,
 * never inside the app, and exists so specs can read database state (an OTP,
 * an order) and reset between tests without needing a DB driver of their own.
 */
export const CONTROL_PORT = 3199;
/** In-process SMTP sink — see `smtp-sink.ts`. */
export const SMTP_PORT = 3198;

export const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
export const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;
export const CONTROL_URL = `http://localhost:${CONTROL_PORT}`;
export const API_BASE_URL = `${BACKEND_URL}/api/v1`;

/**
 * The deterministic fixture set every spec starts from. `POST /reset` on the
 * control server drops the database and rebuilds exactly this.
 */
export const SEED = {
  shop: {
    /** Also the URL slug: /shops/Testaurant/menu */
    name: "Testaurant",
    type: "restaurant",
    address: { country: "Egypt", city: "Cairo", street: "17 Test Street" },
    phoneNumber: "01000000001",
    email: "hello@testaurant.test",
  },
  owner: {
    firstName: "Omar",
    lastName: "Owner",
    email: "e2e.owner@example.test",
    password: "OwnerPass123!",
    phoneNumber: "01000000002",
  },
  /** Registered through the UI by the auth spec; never seeded. */
  newUser: {
    firstName: "Nadia",
    lastName: "Newcomer",
    email: "e2e.newcomer@example.test",
    password: "NewPass123!",
    phoneNumber: "01000000003",
  },
  categories: {
    starters: { en: "Starters", ar: "المقبلات" },
    mains: { en: "Mains", ar: "الأطباق الرئيسية" },
    drinks: { en: "Drinks", ar: "المشروبات" },
  },
  items: {
    /** Plain item, no options — the simplest add-to-cart path. */
    hummus: { en: "Hummus", ar: "حمص", price: 55 },
    /** Has one REQUIRED single-choice option and one optional multi-choice. */
    grill: { en: "Mixed Grill", ar: "مشويات مشكلة", price: 250 },
    /** Carries a discount, so price rendering differs from `price`. */
    koshary: { en: "Koshary", ar: "كشري", price: 100, discount: 20 },
    /** isAvailable: false — must never appear on the public menu. */
    soldOut: { en: "Sold Out Special", ar: "طبق نفد", price: 90 },
    lemonade: { en: "Lemonade", ar: "ليموناضة", price: 40 },
  },
  /** Shaped exactly like `IMenuItem["options"]` so the seed can use it verbatim. */
  options: {
    side: {
      name: { en: "Choice of side", ar: "الطبق الجانبي" },
      type: "single",
      required: true,
      choices: [
        { name: { en: "Egyptian rice", ar: "أرز مصري" }, price: 0 },
        { name: { en: "French fries", ar: "بطاطس محمرة" }, price: 15 },
      ],
    },
    extras: {
      name: { en: "Extras", ar: "إضافات" },
      type: "multiple",
      required: false,
      choices: [{ name: { en: "Extra cheese", ar: "جبنة إضافية" }, price: 20 }],
    },
  },
} as const;
