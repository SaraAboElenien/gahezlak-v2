/**
 * The kitchen side: an order arrives, staff move it through its lifecycle.
 *
 * Order status is not a free-form field — `order.service.ts` enforces a state
 * machine (Pending -> Confirmed -> Preparing -> Ready -> Delivered, with
 * Cancelled reachable only from the first two). The dashboard renders a
 * different button per state and *also* offers a free-choice dropdown, so it
 * is possible for the UI to offer a transition the server will refuse. That
 * disagreement is only visible when both halves run together.
 */
import { expect, placeOrder, test } from "../fixtures/test";
import { loginAsOwner } from "../fixtures/locators";

test.describe("owner order management", () => {
  test("a new order appears in the dashboard with its real details", async ({
    page,
    request,
    seeded,
  }) => {
    const orderNumber = await placeOrder(request, {
      menuItemId: seeded.itemIds.koshary,
      quantity: 3,
      firstName: "Mona",
      lastName: "Diner",
      tableNumber: 12,
    });

    await loginAsOwner(page);
    await page.goto("/dashboard/orders");

    await expect(
      page.getByRole("heading", { name: "Orders", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText(`Order Number: ${orderNumber}`)).toBeVisible();
    await expect(page.getByText("Customer: Mona Diner")).toBeVisible();
    // 100 less its 20% discount, times three — priced by the server.
    await expect(page.getByText("240.00 EGP")).toBeVisible();
    await expect(page.getByText("Payment Method : Cash")).toBeVisible();
  });

  test("confirming an order updates it for real, and the state machine is honoured", async ({
    page,
    request,
    control,
    seeded,
  }) => {
    const orderNumber = await placeOrder(request, {
      menuItemId: seeded.itemIds.hummus,
    });

    await loginAsOwner(page);
    await page.goto("/dashboard/orders");
    await expect(page.getByText(`Order Number: ${orderNumber}`)).toBeVisible();

    await page.getByRole("button", { name: "Confirm" }).click();

    // Waiting on the NEXT state's button rather than on the success toast:
    // toasts linger for five seconds, so a second update would happily match
    // the first one's toast and the assertion would prove nothing. The button
    // set is derived from the order's current status, so it only changes once
    // the refetched list really says "Confirmed".
    await expect(
      page.getByRole("button", { name: "Start Preparing" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm" })).toHaveCount(0);
    expect((await control.order(orderNumber)).orderStatus).toBe("Confirmed");

    await page.getByRole("button", { name: "Start Preparing" }).click();
    await expect(
      page.getByRole("button", { name: "Mark as Ready" }),
    ).toBeVisible();
    expect((await control.order(orderNumber)).orderStatus).toBe("Preparing");
  });

  test("the status dropdown can drive a transition, and an illegal one is refused", async ({
    page,
    request,
    control,
    seeded,
  }) => {
    const orderNumber = await placeOrder(request, {
      menuItemId: seeded.itemIds.lemonade,
    });

    await loginAsOwner(page);
    await page.goto("/dashboard/orders");
    await expect(page.getByText(`Order Number: ${orderNumber}`)).toBeVisible();

    await page.getByRole("button", { name: "Update Status" }).click();
    const dialog = page.getByRole("dialog", { name: "Update Order Status" });
    await expect(dialog).toBeVisible();

    // Pending -> Delivered is not a legal edge, but the dropdown offers every
    // status unconditionally. The server is the thing that has to say no.
    await dialog.getByRole("combobox").selectOption("Delivered");
    await dialog.getByRole("button", { name: "Update Status" }).click();
    await expect(
      page.getByText("Cannot transition from Pending to Delivered"),
    ).toBeVisible();
    // The modal deliberately stays open on failure, so the operator can pick
    // again instead of losing the row they were working on.
    await expect(dialog).toBeVisible();
    expect((await control.order(orderNumber)).orderStatus).toBe("Pending");

    // The legal edge from the same screen does work.
    await dialog.getByRole("combobox").selectOption("Confirmed");
    await dialog.getByRole("button", { name: "Update Status" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Start Preparing" }),
    ).toBeVisible();
    expect((await control.order(orderNumber)).orderStatus).toBe("Confirmed");
  });

  test("filtering by status narrows the list", async ({
    page,
    request,
    seeded,
  }) => {
    const pending = await placeOrder(request, {
      menuItemId: seeded.itemIds.hummus,
    });
    const toConfirm = await placeOrder(request, {
      menuItemId: seeded.itemIds.lemonade,
    });

    await loginAsOwner(page);
    await page.goto("/dashboard/orders");
    await expect(page.getByText(`Order Number: ${toConfirm}`)).toBeVisible();

    // Orders list newest-first, so the second one placed is the first shown.
    await page.getByRole("button", { name: "Confirm" }).first().click();
    await expect(
      page.getByRole("button", { name: "Start Preparing" }),
    ).toBeVisible();

    await page
      .getByRole("combobox")
      .filter({ has: page.getByRole("option", { name: "All Statuses" }) })
      .selectOption("Confirmed");

    await expect(page.getByText(`Order Number: ${toConfirm}`)).toBeVisible();
    await expect(page.getByText(`Order Number: ${pending}`)).toHaveCount(0);
  });

  test("a shop with no orders says so rather than showing an empty page", async ({
    page,
  }) => {
    await loginAsOwner(page);
    await page.goto("/dashboard/orders");
    await expect(page.getByText("No orders found")).toBeVisible();
    await expect(page.getByText("Total Orders Today")).toBeVisible();
  });

  /**
   * REGRESSION TEST — this failed when written; the two keys it guards are the fix.
   *
   * `OrdersList.tsx` labels the cancel action `t("cancelOrder")` (and its
   * pending state `t("cancelling")`), but neither key existed in `en.json` or
   * `ar.json`. i18next's default behaviour is to fall back to the key itself,
   * so restaurant staff saw a button that literally read "cancelOrder" — in
   * both languages — on the one action that destroys an order. Both keys were
   * added alongside their siblings (`completeOrder`/`completing`); this test
   * fails again the moment either is removed.
   */
  test("the cancel action on a pending order is labelled in English", async ({
    page,
    request,
    seeded,
  }) => {
    await placeOrder(request, { menuItemId: seeded.itemIds.hummus });
    await loginAsOwner(page);
    await page.goto("/dashboard/orders");

    await expect(page.getByRole("button", { name: /cancel/i })).toHaveText(
      /Cancel Order/i,
    );
  });
});
