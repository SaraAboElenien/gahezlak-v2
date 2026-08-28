/**
 * The `test` every spec imports.
 *
 * Adds two things to Playwright's base fixtures:
 *
 *   `control` — a typed client for the harness's out-of-band control plane
 *               (read the OTP that would have been emailed, read an order back
 *               out of the database, check a shop's QR code).
 *
 *   an automatic reset — the database is dropped and re-seeded before every
 *               test. That is what lets each spec assume the exact fixture set
 *               in `harness/config.ts` and never clean up after itself, and it
 *               is also what clears the `rate_limits` collection: the auth
 *               router allows 20 requests per 15 minutes per IP and the SPA
 *               POSTs /auth/refresh on every page load, so without this the
 *               suite would start 429-ing partway through for reasons having
 *               nothing to do with what it asserts.
 */
import { test as base, expect, type APIRequestContext } from "@playwright/test";
import sharp from "sharp";
import jsQR from "jsqr";
import { API_BASE_URL, CONTROL_URL, SEED } from "../harness/config";

export interface SeededIds {
  shopId: string;
  ownerId: string;
  categoryIds: { starters: string; mains: string; drinks: string };
  itemIds: Record<keyof typeof SEED.items, string>;
}

export interface VerificationCode {
  code: string | null;
  reason: string | null;
  isVerified: boolean;
}

export interface OrderRecord {
  orderNumber: number;
  orderStatus: string;
  totalAmount: number;
  paymentMethod: string;
  tableNumber?: number;
  customerFirstName: string;
  customerLastName: string;
  customerPhoneNumber: string;
  orderItems: Array<{ quantity: number; price: number }>;
}

export class ControlClient {
  constructor(private readonly request: APIRequestContext) {}

  async reset(): Promise<SeededIds> {
    const response = await this.request.post(`${CONTROL_URL}/reset`);
    expect(
      response.ok(),
      `control /reset failed: ${response.status()} ${await response.text()}`,
    ).toBeTruthy();
    return response.json();
  }

  /** The OTP the app would have emailed. */
  async verificationCode(email: string): Promise<VerificationCode> {
    const response = await this.request.get(
      `${CONTROL_URL}/verification-code?email=${encodeURIComponent(email)}`,
    );
    expect(
      response.ok(),
      `no verification code for ${email}: ${response.status()}`,
    ).toBeTruthy();
    return response.json();
  }

  async order(orderNumber: number | string): Promise<OrderRecord> {
    const response = await this.request.get(
      `${CONTROL_URL}/order?number=${orderNumber}`,
    );
    expect(
      response.ok(),
      `no order ${orderNumber} in the database`,
    ).toBeTruthy();
    return response.json();
  }

  async orders(): Promise<OrderRecord[]> {
    const response = await this.request.get(`${CONTROL_URL}/orders`);
    expect(response.ok()).toBeTruthy();
    return (await response.json()).orders;
  }

  async shop(name: string): Promise<{
    name: string;
    type: string;
    logoUrl?: string;
    ownerId: string;
  }> {
    const response = await this.request.get(
      `${CONTROL_URL}/shop?name=${encodeURIComponent(name)}`,
    );
    expect(response.ok(), `no shop named ${name}`).toBeTruthy();
    return response.json();
  }

  /**
   * Fetch the QR code the API renders for a shop and return the URL it
   * actually encodes.
   *
   * This decodes the real PNG rather than re-encoding one and comparing bytes.
   * The previous version of this check ran the generator a second time and
   * compared its output against what the app had uploaded — which could only
   * ever prove the two agreed. It could not catch both of them encoding the
   * same wrong origin, and that is exactly the bug that shipped: a live shop's
   * QR encoded `http://localhost:5173`, permanently, onto printed table
   * stickers. Reading the URL back out of the image is the assertion that
   * matters, because it is the thing a diner's phone does.
   */
  async qrMenuUrl(shopName: string): Promise<string> {
    const response = await this.request.get(
      `${API_BASE_URL}/shops/name/${encodeURIComponent(shopName)}/qr-code.png`,
    );
    expect(
      response.ok(),
      `qr-code.png failed: ${response.status()} ${await response.text()}`,
    ).toBeTruthy();
    expect(response.headers()["content-type"]).toContain("image/png");

    // jsQR reads raw RGBA. ensureAlpha() guarantees the fourth channel even
    // though the encoder emits opaque output, so a change in how the PNG is
    // written cannot quietly hand jsQR three channels and have it misread
    // every pixel.
    const { data, info } = await sharp(await response.body())
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height);
    expect(
      decoded,
      `could not decode the QR PNG returned for shop "${shopName}"`,
    ).not.toBeNull();

    return decoded!.data;
  }
}

/**
 * Places an order through the app's real public checkout endpoint.
 *
 * Used as an *arrange* step by specs about what the shop does with an order
 * once it exists — driving the whole browse-and-checkout UI again would add
 * ten seconds per test to set up a precondition that `customer-ordering.spec.ts`
 * already covers through the UI end to end. This is the same unauthenticated
 * endpoint the cart form posts to, so the order it creates is indistinguishable
 * from a real one.
 */
export async function placeOrder(
  request: APIRequestContext,
  options: {
    menuItemId: string;
    quantity?: number;
    firstName?: string;
    lastName?: string;
    phone?: string;
    tableNumber?: number;
  },
): Promise<number> {
  const response = await request.post(`${API_BASE_URL}/shops/orders`, {
    data: {
      shopName: SEED.shop.name,
      // Both names are at least three characters because
      // `validateCreateOrder` requires `isLength({ min: 3 })` — a rule the
      // cart form's own schema does not share (it allows one character), which
      // is a real cross-layer mismatch reported separately.
      customerFirstName: options.firstName ?? "Walkin",
      customerLastName: options.lastName ?? "Guest",
      customerPhoneNumber: options.phone ?? "01099988877",
      paymentMethod: "Cash",
      tableNumber: options.tableNumber ?? 3,
      orderItems: [
        {
          menuItem: options.menuItemId,
          quantity: options.quantity ?? 1,
          selectedOptions: [],
        },
      ],
    },
  });
  expect(
    response.ok(),
    `could not place order: ${response.status()} ${await response.text()}`,
  ).toBeTruthy();
  return (await response.json()).data.orderNumber;
}

export const test = base.extend<{ control: ControlClient; seeded: SeededIds }>({
  control: async ({ request }, use) => {
    await use(new ControlClient(request));
  },

  /**
   * The per-test database reset. `auto` is load-bearing.
   *
   * Playwright fixtures are lazy: a test that never names `seeded` would
   * otherwise inherit whatever the previous test left in the database. The
   * first attempt at closing that gap was a `test.beforeEach` in this module
   * requesting `seeded`, and it silently did not work — a hook registered at
   * module scope attaches to the suite that is *currently loading*, and Node
   * caches this module, so its body ran exactly once, during the import of
   * whichever spec file Playwright happened to load first. Every other spec
   * file got no automatic reset at all.
   *
   * It failed quietly because most tests do ask for `seeded` (they need the
   * ids), so they reset anyway. The ones that broke were precisely the tests
   * asserting an EMPTY state — a shop with no orders — which need a clean
   * database more than any other and are the only ones with no reason to
   * mention the fixture. `owner-orders.spec.ts` was reading the previous
   * test's two orders and reporting it as a missing empty-state message.
   *
   * `auto: true` is a property of the fixture rather than of a suite, so it
   * runs for every test in every file that imports this `test`, which is what
   * the hook was only ever pretending to do.
   */
  seeded: [
    async ({ control }, use) => {
      const ids = await control.reset();
      await use(ids);
    },
    { auto: true },
  ],
});

export { expect };
export { SEED };
