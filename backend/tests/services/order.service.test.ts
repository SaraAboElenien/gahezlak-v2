import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import type { Types } from "mongoose";
import type { IMenuItem } from "../../models/MenuItem";
import type { IOrderItem } from "../../models/Order";
import { MenuItemModel } from "../../models/MenuItem";
import { Orders, OrderStatus } from "../../models/Order";
import { PaymentMethods } from "../../models/Payment";
import {
  connectTestDB,
  disconnectTestDB,
  clearTestDB,
} from "../db-test-helper";

/**
 * The order service is the money path: it decides what a customer is charged,
 * and `createPaymentIntent` bills Paymob straight from the `totalAmount` it
 * writes. It had zero tests. Everything here is about a wrong number reaching
 * the card, or one shop reaching another shop's orders.
 *
 * Pricing is delegated to utils/order-calculations.ts, which is exercised
 * through CreateOrder rather than directly — the thing that must be right is
 * the number that lands in the database, not the helper's return value.
 */

const SHOP_A = new mongoose.Types.ObjectId();
const SHOP_B = new mongoose.Types.ObjectId();

// orderNumber carries a unique index; the index survives clearTestDB().
let orderNumberSeq = 900000;
const nextOrderNumber = () => ++orderNumberSeq;

const oid = (v: unknown): Types.ObjectId =>
  new mongoose.Types.ObjectId(String(v));

const orderService = () => import("../../services/order.service");

type MenuOptions = NonNullable<IMenuItem["options"]>;

async function seedMenuItem(
  overrides: {
    shopId?: Types.ObjectId;
    price?: number;
    isAvailable?: boolean;
    discountPercentage?: number;
    options?: MenuOptions;
  } = {},
) {
  return MenuItemModel.create({
    shopId: SHOP_A,
    name: { en: "Burger", ar: "برجر" },
    price: 100,
    categoryId: new mongoose.Types.ObjectId(),
    isAvailable: true,
    discountPercentage: 0,
    ...overrides,
  });
}

/**
 * Every order item is built with a hostile `price`/`discountPercentage` — both
 * are client-supplied fields on the request body, so every pricing assertion
 * below doubles as proof that CreateOrder overwrites them from the menu item
 * rather than trusting the payload.
 */
function orderItem(
  menuItemId: Types.ObjectId,
  quantity = 1,
  selectedOptions: IOrderItem["selectedOptions"] = [],
): IOrderItem {
  return {
    menuItem: menuItemId,
    quantity,
    customizationDetails: "",
    selectedOptions,
    discountPercentage: 99,
    price: 0.01,
  };
}

function orderInput(items: IOrderItem[], shopId: Types.ObjectId = SHOP_A) {
  return {
    shopId,
    orderNumber: nextOrderNumber(),
    customerFirstName: "Test",
    customerLastName: "Customer",
    customerPhoneNumber: "01000000000",
    paymentMethod: PaymentMethods.Cash,
    tableNumber: 5,
    orderItems: items,
  };
}

async function seedOrder(
  status: OrderStatus,
  shopId: Types.ObjectId = SHOP_A,
  createdAt?: Date,
) {
  const order = await Orders.create({
    shopId,
    orderNumber: nextOrderNumber(),
    customerFirstName: "Test",
    customerLastName: "Customer",
    customerPhoneNumber: "01000000000",
    paymentMethod: PaymentMethods.Cash,
    orderStatus: status,
    totalAmount: 100,
    orderItems: [
      { menuItem: new mongoose.Types.ObjectId(), quantity: 1, price: 100 },
    ],
  });

  if (createdAt) {
    // timestamps:false so the plugin doesn't stomp the value straight back.
    await Orders.findByIdAndUpdate(
      order._id,
      { createdAt },
      { timestamps: false },
    );
  }

  return order;
}

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

afterEach(async () => {
  await clearTestDB();
});

describe("CreateOrder pricing", () => {
  it("charges the menu price and discards the price the client sent", async () => {
    const { CreateOrder } = await orderService();
    const item = await seedMenuItem({ price: 100 });

    const created = await CreateOrder(orderInput([orderItem(oid(item._id))]));

    expect(created.totalAmount).toBe(100);
    expect(created.orderItems[0].price).toBe(100);
    expect(created.orderItems[0].discountPercentage).toBe(0);

    // The returned object is a in-memory copy; what bills the customer is the
    // stored document, so assert the persisted values separately.
    const stored = await Orders.findById(created._id).lean();
    expect(stored?.totalAmount).toBe(100);
    expect(stored?.orderItems[0].price).toBe(100);
  });

  it("adds the price of every selected choice across several options", async () => {
    const { CreateOrder } = await orderService();
    const item = await seedMenuItem({
      price: 100,
      options: [
        {
          name: { en: "Size", ar: "الحجم" },
          type: "single",
          required: false,
          choices: [
            { name: { en: "Large", ar: "كبير" }, price: 15 },
            { name: { en: "Small", ar: "صغير" }, price: 0 },
          ],
        },
        {
          name: { en: "Extras", ar: "إضافات" },
          type: "multiple",
          required: false,
          choices: [
            { name: { en: "Cheese", ar: "جبنة" }, price: 10 },
            { name: { en: "Bacon", ar: "لحم" }, price: 20 },
          ],
        },
      ] as MenuOptions,
    });

    const [size, extras] = item.options!;
    const created = await CreateOrder(
      orderInput([
        orderItem(oid(item._id), 1, [
          { optionId: oid(size._id), choiceIds: [oid(size.choices[0]._id)] },
          {
            optionId: oid(extras._id),
            choiceIds: [oid(extras.choices[0]._id), oid(extras.choices[1]._id)],
          },
        ]),
      ]),
    );

    // 100 + 15 (Large) + 10 (Cheese) + 20 (Bacon)
    expect(created.totalAmount).toBe(145);

    const stored = await Orders.findById(created._id).lean();
    expect(stored?.orderItems[0].price).toBe(145);
    expect(stored?.orderItems[0].selectedOptions).toHaveLength(2);
  });

  it("applies the discount to the base price only, never to option extras", async () => {
    const { CreateOrder } = await orderService();
    const item = await seedMenuItem({
      price: 200,
      discountPercentage: 25,
      options: [
        {
          name: { en: "Add-on", ar: "إضافة" },
          type: "single",
          required: false,
          choices: [{ name: { en: "Truffle", ar: "كمأة" }, price: 30 }],
        },
      ] as MenuOptions,
    });

    const option = item.options![0];
    const created = await CreateOrder(
      orderInput([
        orderItem(oid(item._id), 1, [
          {
            optionId: oid(option._id),
            choiceIds: [oid(option.choices[0]._id)],
          },
        ]),
      ]),
    );

    // (200 - 25%) + 30 = 180. If the discount ever started applying to the
    // extra too the shop would silently eat 7.50 EGP on every such order.
    expect(created.totalAmount).toBe(180);
    expect(created.orderItems[0].discountPercentage).toBe(25);

    const stored = await Orders.findById(created._id).lean();
    expect(stored?.totalAmount).toBe(180);
  });

  it("stores a unit price and multiplies it by quantity in the total", async () => {
    const { CreateOrder } = await orderService();
    const item = await seedMenuItem({ price: 50 });

    const created = await CreateOrder(
      orderInput([orderItem(oid(item._id), 3)]),
    );

    // The per-item `price` is the unit price, not the line total — the
    // frontend renders both, so conflating them misprices the whole receipt.
    expect(created.orderItems[0].price).toBe(50);
    expect(created.totalAmount).toBe(150);

    const stored = await Orders.findById(created._id).lean();
    expect(stored?.orderItems[0].price).toBe(50);
    expect(stored?.totalAmount).toBe(150);
  });

  it("sums several distinct items, each with its own discount and extras", async () => {
    const { CreateOrder } = await orderService();
    const discounted = await seedMenuItem({
      price: 120,
      discountPercentage: 50,
    });
    const withExtra = await seedMenuItem({
      price: 80,
      options: [
        {
          name: { en: "Sauce", ar: "صوص" },
          type: "single",
          required: false,
          choices: [{ name: { en: "Garlic", ar: "ثوم" }, price: 20 }],
        },
      ] as MenuOptions,
    });

    const sauce = withExtra.options![0];
    const created = await CreateOrder(
      orderInput([
        orderItem(oid(discounted._id), 2),
        orderItem(oid(withExtra._id), 1, [
          { optionId: oid(sauce._id), choiceIds: [oid(sauce.choices[0]._id)] },
        ]),
      ]),
    );

    // (60 x 2) + (100 x 1)
    expect(created.orderItems[0].price).toBe(60);
    expect(created.orderItems[1].price).toBe(100);
    expect(created.totalAmount).toBe(220);

    const stored = await Orders.findById(created._id).lean();
    expect(stored?.totalAmount).toBe(220);
  });

  it("prices the same menu item twice when it appears as two lines with different options", async () => {
    const { CreateOrder } = await orderService();
    const item = await seedMenuItem({
      price: 100,
      options: [
        {
          name: { en: "Size", ar: "الحجم" },
          type: "single",
          required: false,
          choices: [
            { name: { en: "Medium", ar: "وسط" }, price: 10 },
            { name: { en: "Large", ar: "كبير" }, price: 25 },
          ],
        },
      ] as MenuOptions,
    });

    const size = item.options![0];
    const created = await CreateOrder(
      orderInput([
        orderItem(oid(item._id), 1, [
          { optionId: oid(size._id), choiceIds: [oid(size.choices[0]._id)] },
        ]),
        orderItem(oid(item._id), 1, [
          { optionId: oid(size._id), choiceIds: [oid(size.choices[1]._id)] },
        ]),
      ]),
    );

    // Guards the de-duplication in the lookup: the "did we find every menu
    // item" check compares against the *unique* id count, so a repeated item
    // must not be read as a missing one.
    expect(created.orderItems[0].price).toBe(110);
    expect(created.orderItems[1].price).toBe(125);
    expect(created.totalAmount).toBe(235);
  });

  it("stores unrounded fractional money rather than snapping to piastres", async () => {
    const { CreateOrder } = await orderService();
    const item = await seedMenuItem({ price: 10.99, discountPercentage: 10 });

    const created = await CreateOrder(
      orderInput([orderItem(oid(item._id), 3)]),
    );

    // Documented, not endorsed: nothing rounds here, so a stored total can
    // carry sub-piastre precision. It is safe today only because
    // createPaymentIntent does `Math.round(totalAmount * 100)` before billing.
    expect(created.orderItems[0].price).toBeCloseTo(9.891, 6);
    expect(created.totalAmount).toBeCloseTo(29.673, 6);
  });
});

describe("CreateOrder option validation (price tampering)", () => {
  it("rejects an option id that does not exist on the menu item", async () => {
    const { CreateOrder } = await orderService();
    const item = await seedMenuItem({
      price: 100,
      options: [
        {
          name: { en: "Size", ar: "الحجم" },
          type: "single",
          required: false,
          choices: [{ name: { en: "Large", ar: "كبير" }, price: 15 }],
        },
      ] as MenuOptions,
    });

    await expect(
      CreateOrder(
        orderInput([
          orderItem(oid(item._id), 1, [
            {
              optionId: new mongoose.Types.ObjectId(),
              choiceIds: [oid(item.options![0].choices[0]._id)],
            },
          ]),
        ]),
      ),
    ).rejects.toThrow("Invalid option selected");

    // A rejected order must leave nothing behind to be paid for.
    expect(await Orders.countDocuments({})).toBe(0);
  });

  it("ignores a choice borrowed from a different option, so it cannot move the price", async () => {
    const { CreateOrder } = await orderService();
    const item = await seedMenuItem({
      price: 100,
      options: [
        {
          name: { en: "Size", ar: "الحجم" },
          type: "single",
          required: false,
          choices: [{ name: { en: "Large", ar: "كبير" }, price: 15 }],
        },
        {
          name: { en: "Discount card", ar: "بطاقة خصم" },
          type: "single",
          required: false,
          choices: [{ name: { en: "Staff", ar: "موظف" }, price: -90 }],
        },
      ] as MenuOptions,
    });

    const [size, card] = item.options!;
    // The hostile move: quote a legitimate option id but pass a choice id
    // lifted from another option — here a -90 staff discount — hoping the
    // lookup is global rather than scoped to the option.
    const created = await CreateOrder(
      orderInput([
        orderItem(oid(item._id), 1, [
          { optionId: oid(size._id), choiceIds: [oid(card.choices[0]._id)] },
        ]),
      ]),
    );

    expect(created.totalAmount).toBe(100);
    const stored = await Orders.findById(created._id).lean();
    expect(stored?.orderItems[0].price).toBe(100);
  });

  it("does not let an unknown choice id inflate the price", async () => {
    const { CreateOrder } = await orderService();
    const item = await seedMenuItem({
      price: 100,
      options: [
        {
          name: { en: "Size", ar: "الحجم" },
          type: "single",
          required: false,
          choices: [{ name: { en: "Large", ar: "كبير" }, price: 15 }],
        },
      ] as MenuOptions,
    });

    const bogusChoice = new mongoose.Types.ObjectId();
    const created = await CreateOrder(
      orderInput([
        orderItem(oid(item._id), 1, [
          {
            optionId: oid(item.options![0]._id),
            choiceIds: [bogusChoice],
          },
        ]),
      ]),
    );

    expect(created.totalAmount).toBe(100);

    // CURRENT BEHAVIOUR, not desired behaviour: an unknown choice id is
    // skipped for pricing but still written to the order verbatim, so the
    // kitchen ticket shows a selection that does not exist on the menu.
    // Money-safe, data-dirty. Reported; do not "fix" by changing this
    // assertion.
    const stored = await Orders.findById(created._id).lean();
    expect(
      stored?.orderItems[0].selectedOptions?.[0].choiceIds.map(String),
    ).toEqual([bogusChoice.toString()]);
  });

  it("refuses to price an item whose required option was not selected", async () => {
    const { CreateOrder } = await orderService();
    const item = await seedMenuItem({
      price: 100,
      options: [
        {
          name: { en: "Size", ar: "الحجم" },
          type: "single",
          required: true,
          choices: [{ name: { en: "Large", ar: "كبير" }, price: 15 }],
        },
      ] as MenuOptions,
    });

    await expect(
      CreateOrder(orderInput([orderItem(oid(item._id))])),
    ).rejects.toThrow("Required option 'Size' not selected");

    expect(await Orders.countDocuments({})).toBe(0);
  });
});

describe("CreateOrder shop and availability guards", () => {
  it("refuses a menu item belonging to another shop", async () => {
    const { CreateOrder } = await orderService();
    const foreign = await seedMenuItem({ shopId: SHOP_B, price: 100 });

    // IDOR-shaped: without the shopId filter a customer could order (and a
    // shop could be paid for) another restaurant's menu.
    await expect(
      CreateOrder(orderInput([orderItem(oid(foreign._id))], SHOP_A)),
    ).rejects.toThrow("Menu item not found");

    expect(await Orders.countDocuments({})).toBe(0);
  });

  it("refuses an unavailable menu item", async () => {
    const { CreateOrder } = await orderService();
    const item = await seedMenuItem({ isAvailable: false });

    await expect(
      CreateOrder(orderInput([orderItem(oid(item._id))])),
    ).rejects.toThrow("Menu item not found");

    expect(await Orders.countDocuments({})).toBe(0);
  });

  it("rejects the whole order when only one of several items is foreign", async () => {
    const { CreateOrder } = await orderService();
    const mine = await seedMenuItem({ price: 100 });
    const foreign = await seedMenuItem({ shopId: SHOP_B, price: 100 });

    // Partial acceptance would be worse than rejection: the customer would be
    // charged a total that no longer matches what they chose.
    await expect(
      CreateOrder(
        orderInput([orderItem(oid(mine._id)), orderItem(oid(foreign._id))]),
      ),
    ).rejects.toThrow("Menu item not found");

    expect(await Orders.countDocuments({})).toBe(0);
  });

  it("refuses a menu item id that does not exist at all", async () => {
    const { CreateOrder } = await orderService();

    await expect(
      CreateOrder(orderInput([orderItem(new mongoose.Types.ObjectId())])),
    ).rejects.toThrow("Menu item not found");
  });
});

describe("UpdateOrderStatus transitions", () => {
  const legal: [OrderStatus, OrderStatus][] = [
    [OrderStatus.Pending, OrderStatus.Confirmed],
    [OrderStatus.Pending, OrderStatus.Cancelled],
    [OrderStatus.Confirmed, OrderStatus.Preparing],
    [OrderStatus.Confirmed, OrderStatus.Cancelled],
    [OrderStatus.Preparing, OrderStatus.Ready],
    [OrderStatus.Ready, OrderStatus.Delivered],
  ];

  // Cancellation triggers a Paymob refund in the controller, and Delivered is
  // the terminal paid state — so both the reachable and the unreachable edges
  // of this machine have money attached.
  const illegal: [OrderStatus, OrderStatus][] = [
    [OrderStatus.Pending, OrderStatus.Preparing],
    [OrderStatus.Pending, OrderStatus.Ready],
    [OrderStatus.Pending, OrderStatus.Delivered],
    [OrderStatus.Pending, OrderStatus.Pending],
    [OrderStatus.Confirmed, OrderStatus.Ready],
    [OrderStatus.Confirmed, OrderStatus.Delivered],
    [OrderStatus.Preparing, OrderStatus.Cancelled],
    [OrderStatus.Preparing, OrderStatus.Delivered],
    [OrderStatus.Ready, OrderStatus.Cancelled],
    [OrderStatus.Ready, OrderStatus.Preparing],
    [OrderStatus.Delivered, OrderStatus.Cancelled],
    [OrderStatus.Delivered, OrderStatus.Ready],
    [OrderStatus.Cancelled, OrderStatus.Pending],
    [OrderStatus.Cancelled, OrderStatus.Confirmed],
  ];

  it.each(legal)("allows %s -> %s", async (from, to) => {
    const { UpdateOrderStatus } = await orderService();
    const order = await seedOrder(from);

    const updated = await UpdateOrderStatus(
      SHOP_A.toString(),
      order._id.toString(),
      to,
    );

    expect(updated.orderStatus).toBe(to);
    const stored = await Orders.findById(order._id).lean();
    expect(stored?.orderStatus).toBe(to);
  });

  it.each(illegal)("rejects %s -> %s", async (from, to) => {
    const { UpdateOrderStatus } = await orderService();
    const order = await seedOrder(from);

    await expect(
      UpdateOrderStatus(SHOP_A.toString(), order._id.toString(), to),
    ).rejects.toThrow(`Cannot transition from ${from} to ${to}`);

    const stored = await Orders.findById(order._id).lean();
    expect(stored?.orderStatus).toBe(from);
  });

  it("will not let another shop move an order it does not own", async () => {
    const { UpdateOrderStatus } = await orderService();
    const order = await seedOrder(OrderStatus.Pending, SHOP_A);

    // Cross-tenant write: cancelling someone else's order would also fire the
    // controller's refund path against their transaction.
    await expect(
      UpdateOrderStatus(
        SHOP_B.toString(),
        order._id.toString(),
        OrderStatus.Cancelled,
      ),
    ).rejects.toThrow("Order not found");

    const stored = await Orders.findById(order._id).lean();
    expect(stored?.orderStatus).toBe(OrderStatus.Pending);
  });

  it("throws for an order id that does not exist", async () => {
    const { UpdateOrderStatus } = await orderService();

    await expect(
      UpdateOrderStatus(
        SHOP_A.toString(),
        new mongoose.Types.ObjectId().toString(),
        OrderStatus.Confirmed,
      ),
    ).rejects.toThrow("Order not found");
  });
});

describe("GetOrderById", () => {
  it("returns the shop's own order", async () => {
    const { GetOrderById } = await orderService();
    const order = await seedOrder(OrderStatus.Pending, SHOP_A);

    const found = await GetOrderById(order._id.toString(), SHOP_A.toString());

    expect(found._id.toString()).toBe(order._id.toString());
    expect(found.totalAmount).toBe(100);
  });

  it("hides an order belonging to another shop behind the same not-found error", async () => {
    const { GetOrderById } = await orderService();
    const order = await seedOrder(OrderStatus.Pending, SHOP_A);

    // Must be indistinguishable from a missing order: a different error would
    // confirm the id exists and leak another shop's order volume.
    await expect(
      GetOrderById(order._id.toString(), SHOP_B.toString()),
    ).rejects.toThrow("Order not found");
  });

  it("throws for an order that does not exist", async () => {
    const { GetOrderById } = await orderService();

    await expect(
      GetOrderById(new mongoose.Types.ObjectId().toString(), SHOP_A.toString()),
    ).rejects.toThrow("Order not found");
  });
});

describe("GetOrdersByShop", () => {
  it("returns only the requesting shop's orders and strips shopId", async () => {
    const { GetOrdersByShop } = await orderService();
    await seedOrder(OrderStatus.Pending, SHOP_A);
    await seedOrder(OrderStatus.Pending, SHOP_A);
    await seedOrder(OrderStatus.Pending, SHOP_B);

    const { orders, totalCount } = await GetOrdersByShop({
      shopId: SHOP_A.toString(),
      query: {},
      skip: 0,
      limit: 10,
    });

    expect(orders).toHaveLength(2);
    expect(totalCount).toBe(2);
    expect(orders[0].shopId).toBeUndefined();
  });

  it("paginates with skip and limit while reporting the unpaginated total", async () => {
    const { GetOrdersByShop } = await orderService();
    const base = Date.UTC(2026, 0, 1);
    for (let i = 0; i < 5; i++) {
      await seedOrder(OrderStatus.Pending, SHOP_A, new Date(base + i * 60_000));
    }

    const page1 = await GetOrdersByShop({
      shopId: SHOP_A.toString(),
      query: {},
      skip: 0,
      limit: 2,
    });
    const page3 = await GetOrdersByShop({
      shopId: SHOP_A.toString(),
      query: {},
      skip: 4,
      limit: 2,
    });

    expect(page1.orders).toHaveLength(2);
    // totalCount drives the controller's page count; it must ignore skip/limit.
    expect(page1.totalCount).toBe(5);
    expect(page3.orders).toHaveLength(1);
    expect(page3.totalCount).toBe(5);

    const ids = new Set([
      ...page1.orders.map((o) => o._id.toString()),
      ...page3.orders.map((o) => o._id.toString()),
    ]);
    expect(ids.size).toBe(3);
  });

  it("sorts newest first", async () => {
    const { GetOrdersByShop } = await orderService();
    const base = Date.UTC(2026, 0, 1);
    const oldest = await seedOrder(OrderStatus.Pending, SHOP_A, new Date(base));
    const middle = await seedOrder(
      OrderStatus.Pending,
      SHOP_A,
      new Date(base + 60_000),
    );
    const newest = await seedOrder(
      OrderStatus.Pending,
      SHOP_A,
      new Date(base + 120_000),
    );

    const { orders } = await GetOrdersByShop({
      shopId: SHOP_A.toString(),
      query: {},
      skip: 0,
      limit: 10,
    });

    expect(orders.map((o) => o._id.toString())).toEqual([
      newest._id.toString(),
      middle._id.toString(),
      oldest._id.toString(),
    ]);
  });

  /**
   * Regression: `query` used to be spread into `countDocuments` but never into
   * `Orders.find`, so a filtered request returned every row while `totalCount`
   * reported the filtered figure. Latent only because the one caller
   * (getOrdersByShopHandler) leaves `query` empty with its kitchen filter
   * commented out — any status or date filter added to that endpoint would
   * have silently shipped other statuses to whoever asked for one.
   */
  it("returns only rows matching `query`, and counts the same set", async () => {
    const { GetOrdersByShop } = await orderService();
    await seedOrder(OrderStatus.Pending, SHOP_A);
    await seedOrder(OrderStatus.Pending, SHOP_A);
    await seedOrder(OrderStatus.Pending, SHOP_A);
    await seedOrder(OrderStatus.Confirmed, SHOP_A);
    await seedOrder(OrderStatus.Confirmed, SHOP_A);

    const { orders, totalCount } = await GetOrdersByShop({
      shopId: SHOP_A.toString(),
      query: { orderStatus: OrderStatus.Confirmed },
      skip: 0,
      limit: 10,
    });

    expect(orders).toHaveLength(2);
    expect(
      orders.filter((o) => o.orderStatus === OrderStatus.Pending),
    ).toHaveLength(0);
    // The rows and the count must agree, or the caller pages through a total
    // that does not describe what it received.
    expect(totalCount).toBe(2);
  });

  it("cannot be made to read another shop's orders through `query`", async () => {
    const { GetOrdersByShop } = await orderService();
    await seedOrder(OrderStatus.Pending, SHOP_A);
    await seedOrder(OrderStatus.Pending, SHOP_B);
    await seedOrder(OrderStatus.Pending, SHOP_B);

    // shopId is applied last, so a filter naming a different shop cannot widen
    // the scope past the caller's own.
    const { orders, totalCount } = await GetOrdersByShop({
      shopId: SHOP_A.toString(),
      query: { shopId: SHOP_B },
      skip: 0,
      limit: 10,
    });

    expect(orders).toHaveLength(1);
    expect(totalCount).toBe(1);
  });
});
