/**
 * Restaurant-owner onboarding: register -> verify the emailed code -> create a
 * shop -> land on the subscription step, plus logging back in afterwards.
 *
 * Two things here are only observable end to end. The first is that the app
 * routes people by *state* rather than by explicit navigation — `Login` never
 * calls `navigate()`; `RedirectIfAuthenticated` decides where you go based on
 * whether you have a shop and a live subscription. The second is that the
 * session is now split between an in-memory access token and an httpOnly
 * refresh cookie, so "does a reload keep me logged in?" is a question only a
 * real browser can answer.
 */
import { expect, SEED, test } from "../fixtures/test";

const NEW = SEED.newUser;

test.describe("owner onboarding", () => {
  test("register -> verify -> create shop, and the new shop's QR points at this origin", async ({
    page,
    control,
  }) => {
    // --- Register ---------------------------------------------------------
    await page.goto("/auth/register");
    await expect(
      page.getByRole("heading", { name: "Join Us Now!" }),
    ).toBeVisible();

    await page.getByLabel("First Name").fill(NEW.firstName);
    await page.getByLabel("Last Name").fill(NEW.lastName);
    await page.getByLabel("Email", { exact: true }).fill(NEW.email);
    await page.getByLabel("Phone Number").fill(NEW.phoneNumber);
    await page.getByLabel("Password", { exact: true }).fill(NEW.password);
    await page.getByLabel("Confirm Password").fill(NEW.password);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Register" }).click();

    // --- Verify -----------------------------------------------------------
    await expect(page).toHaveURL(/\/auth\/verify$/);

    // The code only ever existed in an email. Reading it out of the ephemeral
    // database is both simpler than running a mail client and a stronger
    // assertion: it proves the OTP the app *stored* is the one that works.
    const { code, reason, isVerified } = await control.verificationCode(
      NEW.email,
    );
    expect(reason).toBe("account_verification");
    expect(isVerified).toBe(false);
    expect(code).toMatch(/^[a-z0-9]{6}$/i);

    await page.getByLabel("Verification Code").fill(code!);
    await page.getByRole("button", { name: "Verify Code" }).click();

    // --- Create shop ------------------------------------------------------
    await expect(page).toHaveURL(/\/auth\/create-shop$/);
    await expect(
      page.getByRole("heading", { name: "Create Your Shop" }),
    ).toBeVisible();

    const shopName = "Newcomer Grill";
    await page.getByLabel("Shop Name").fill(shopName);
    await page.getByLabel("Shop Type").fill("restaurant");
    await page.getByLabel("Country").fill("Egypt");
    await page.getByLabel("City").fill("Giza");
    await page.getByLabel("Street").fill("9 Pyramid Road");
    await page.getByLabel("Phone Number").fill(NEW.phoneNumber);
    await page.getByLabel("Email", { exact: true }).fill("hi@newcomer.test");
    await page.getByRole("button", { name: "Create Shop" }).click();

    // A shop with no subscription cannot reach the dashboard, so the app sends
    // the owner to pay. This is the gate `checkActiveSubscrtion` enforces
    // server-side; here we are checking the client honours the same rule.
    await expect(page).toHaveURL(/\/auth\/subscribe$/);

    const shop = await control.shop(shopName);
    expect(shop.name).toBe(shopName);

    // REGRESSION GUARD, and the reason it is worth the cost of decoding a PNG:
    // a shop's QR code goes onto printed table stickers, so encoding the wrong
    // origin is not a bug anyone notices until the stickers are on the tables.
    // A live shop shipped in exactly that state, its QR encoding
    // http://localhost:5173, because the origin was baked in at creation time
    // from whatever FRONTEND_URL happened to be then.
    //
    // The QR is now rendered on demand and reads FRONTEND_URL at call time, so
    // this asserts the property that actually matters to a diner: point a
    // phone at it and you land on THIS shop's menu, on THIS origin.
    const menuUrl = await control.qrMenuUrl(shopName);
    expect(menuUrl).toBe(
      `${new URL(page.url()).origin}/shops/${encodeURIComponent(shopName)}/menu`,
    );
  });

  test("an unverified account cannot log in", async ({ page, control }) => {
    await page.goto("/auth/register");
    await page.getByLabel("First Name").fill(NEW.firstName);
    await page.getByLabel("Last Name").fill(NEW.lastName);
    await page.getByLabel("Email", { exact: true }).fill(NEW.email);
    await page.getByLabel("Phone Number").fill(NEW.phoneNumber);
    await page.getByLabel("Password", { exact: true }).fill(NEW.password);
    await page.getByLabel("Confirm Password").fill(NEW.password);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Register" }).click();
    await expect(page).toHaveURL(/\/auth\/verify$/);

    expect((await control.verificationCode(NEW.email)).isVerified).toBe(false);

    await page.goto("/auth");
    await page.getByLabel("Email", { exact: true }).fill(NEW.email);
    await page.getByLabel("Password", { exact: true }).fill(NEW.password);
    await page.getByRole("button", { name: "Login", exact: true }).click();

    await expect(page.getByText(/Login failed/)).toBeVisible();
    await expect(page).toHaveURL(/\/auth$/);
  });

  test("a wrong verification code is rejected", async ({ page, control }) => {
    await page.goto("/auth/register");
    await page.getByLabel("First Name").fill(NEW.firstName);
    await page.getByLabel("Last Name").fill(NEW.lastName);
    await page.getByLabel("Email", { exact: true }).fill(NEW.email);
    await page.getByLabel("Phone Number").fill(NEW.phoneNumber);
    await page.getByLabel("Password", { exact: true }).fill(NEW.password);
    await page.getByLabel("Confirm Password").fill(NEW.password);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Register" }).click();
    await expect(page).toHaveURL(/\/auth\/verify$/);

    await page.getByLabel("Verification Code").fill("000000");
    await page.getByRole("button", { name: "Verify Code" }).click();

    await expect(page.getByText(/Error/)).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/verify$/);
    expect((await control.verificationCode(NEW.email)).isVerified).toBe(false);
  });

  test("an existing owner logs in and the session survives a reload", async ({
    page,
  }) => {
    await page.goto("/auth");
    await page.getByLabel("Email", { exact: true }).fill(SEED.owner.email);
    await page
      .getByLabel("Password", { exact: true })
      .fill(SEED.owner.password);
    await page.getByRole("button", { name: "Login", exact: true }).click();

    // Owner + shop + active subscription = straight to the dashboard.
    await expect(page).toHaveURL(/\/dashboard\/overview$/);

    // The access token lives in memory only, so it is gone the instant the
    // page reloads. Staying logged in depends entirely on the httpOnly refresh
    // cookie being set with attributes the browser accepts and replayed to
    // /auth/refresh — none of which a unit test can observe.
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard\/overview$/);
    await expect(
      page.getByRole("link", { name: "Menu", exact: true }),
    ).toBeVisible();
  });
});
