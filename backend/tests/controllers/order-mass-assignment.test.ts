import { describe, it, expect } from "vitest";
import { pickCustomerOrderFields } from "../../controllers/order.controller";
import { OrderStatus } from "../../models/Order";
import { PaymentMethods } from "../../models/Payment";

/**
 * `POST /shops/orders` is deliberately unauthenticated — a diner scanning a QR
 * code is not logged in — and `validateCreateOrder` only checks the fields it
 * names, stripping nothing. The controller used to do
 * `const { shopName, ...orderData } = req.body` and hand that straight to
 * `CreateOrder`, which spreads it into `Orders.create`.
 *
 * `CreateOrder` already recomputes price/discountPercentage/totalAmount from
 * the menu and overrides shopId/orderNumber — but nothing touched
 * `orderStatus` or `paymobTransactionId`. So an anonymous caller could POST a
 * normal order plus `"orderStatus": "Confirmed"` and land a fully-paid-looking
 * order on the shop's kitchen queue without paying: `Confirmed` is precisely
 * the signal `handleOrderPaid()` writes when Paymob reports money arrived, so
 * staff had no way to tell a forged order from a real one.
 *
 * Seventh instance of this codebase's mass-assignment shape, and the first on
 * a *create* path with no authentication — the other six all required an
 * authenticated caller. The guard is an allowlist, so these tests are written
 * in both directions: the dangerous fields must be dropped, AND every field a
 * real customer submits must survive. That two-direction rule is here because
 * this project once shipped an allowlist that silently stripped `type` and
 * `logoUrl` from every shop update while still returning 200.
 */

const legitimateOrder = {
  tableNumber: 7,
  orderItems: [{ menuItem: "6a6c8a0512c0929fac5c5eba", quantity: 2 }],
  customerFirstName: "Sara",
  customerLastName: "Ali",
  customerPhoneNumber: "01012345678",
  paymentMethod: PaymentMethods.Cash,
};

describe("pickCustomerOrderFields", () => {
  it("drops orderStatus, so an order cannot be born Confirmed", () => {
    const picked = pickCustomerOrderFields({
      ...legitimateOrder,
      orderStatus: OrderStatus.Confirmed,
    } as never);

    expect(picked).not.toHaveProperty("orderStatus");
  });

  it("drops paymobTransactionId, so a forged order carries no receipt", () => {
    const picked = pickCustomerOrderFields({
      ...legitimateOrder,
      paymobTransactionId: "999000111",
    } as never);

    expect(picked).not.toHaveProperty("paymobTransactionId");
  });

  it("drops server-derived and money fields even when supplied", () => {
    const picked = pickCustomerOrderFields({
      ...legitimateOrder,
      shopId: "6a6c8a0512c0929fac5c5eba",
      orderNumber: 1,
      totalAmount: 0,
      _id: "6a6c8a0512c0929fac5c5ebb",
    } as never);

    for (const field of ["shopId", "orderNumber", "totalAmount", "_id"]) {
      expect(picked).not.toHaveProperty(field);
    }
  });

  it("keeps every field a real customer legitimately submits", () => {
    // The other direction: an allowlist that drops valid input is its own bug.
    const picked = pickCustomerOrderFields(legitimateOrder as never);

    expect(picked).toEqual(legitimateOrder);
  });

  it("omits absent optional fields rather than writing undefined", () => {
    // `$set: { field: undefined }` is stripped by Mongoose rather than
    // clearing it — this project has been bitten by that before, so the
    // picker must not manufacture undefined keys.
    const { tableNumber: _omitted, ...noTable } = legitimateOrder;
    const picked = pickCustomerOrderFields(noTable as never);

    expect(picked).not.toHaveProperty("tableNumber");
  });
});
