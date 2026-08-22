import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import type { Types } from "mongoose";
import { Report } from "../../models/Report";
import { Role } from "../../models/Role";
import { Orders, OrderStatus } from "../../models/Order";
import { Shops } from "../../models/Shop";
import {
  connectTestDB,
  disconnectTestDB,
  clearTestDB,
} from "../db-test-helper";

/**
 * Service-level coverage for the report service: the two complaint inboxes —
 * a customer writing to a restaurant about an order, and anyone writing to
 * the platform admin through the landing page's contact form.
 *
 * Both write paths are **unauthenticated** (`routes/report.routes.ts` mounts
 * them with no `protect`), so `req.body` here is raw internet input with no
 * token behind it. That makes two things load-bearing and both are tested:
 *
 *   - `receiver` decides which inbox a report lands in, and `shopId` decides
 *     whose. Neither may come from the body. The services set both *after*
 *     the spread; reverse either and a stranger could post into any shop's
 *     dashboard, or hide a complaint from the admin.
 *   - `createShopReport` is the only place that proves the sender is really
 *     the customer: the order must exist, belong to *that* shop, and match
 *     the submitted name and phone. That check is what stops a competitor
 *     from filling a restaurant's inbox with invented orders.
 *
 * Nothing is mocked — the report service has no external boundary. Two
 * findings below (the phone-number cast, and the cross-inbox behaviour of an
 * injected `shopId`) only exist because the real schema does the casting and
 * the real query does the filtering.
 */

const SHOP_A = new mongoose.Types.ObjectId();
const SHOP_B = new mongoose.Types.ObjectId();

const reportService = () => import("../../services/report.service");

async function seedShop(name: string, _id: Types.ObjectId) {
  return Shops.create({
    _id,
    name,
    type: "restaurant",
    address: { country: "EG", city: "Cairo", street: "1 Main St" },
    phoneNumber: "01000000000",
    email: `${name.toLowerCase()}@example.com`,
    ownerId: new mongoose.Types.ObjectId(),
  });
}

async function seedOrder(
  overrides: {
    shopId?: Types.ObjectId;
    orderNumber?: number;
    customerFirstName?: string;
    customerLastName?: string;
    customerPhoneNumber?: string;
  } = {},
) {
  return Orders.create({
    shopId: SHOP_A,
    orderNumber: 1001,
    customerFirstName: "Sara",
    customerLastName: "Ali",
    customerPhoneNumber: "01012345678",
    orderStatus: OrderStatus.Delivered,
    totalAmount: 100,
    orderItems: [
      {
        menuItem: new mongoose.Types.ObjectId(),
        quantity: 1,
        price: 100,
        discountPercentage: 0,
      },
    ],
    ...overrides,
  });
}

/**
 * The payload `createShopReport` accepts. `overrides` is deliberately untyped
 * so a test can smuggle in a field the signature forbids — the controller
 * builds this object straight from `req.body` on an unauthenticated route,
 * which is exactly that kind of hostile input.
 */
function shopReportInput(overrides: Record<string, unknown> = {}) {
  return {
    orderNumber: 1001,
    senderFirstName: "Sara",
    senderLastName: "Ali",
    phoneNumber: "01012345678",
    message: "The order arrived cold and late.",
    ...overrides,
  } as unknown as Parameters<
    Awaited<ReturnType<typeof reportService>>["createShopReport"]
  >[1];
}

function adminReportInput(overrides: Record<string, unknown> = {}) {
  return {
    shopName: "Alpha",
    senderFirstName: "Sara",
    senderLastName: "Ali",
    phoneNumber: "01012345678",
    message: "I could not reach this restaurant at all.",
    ...overrides,
  } as unknown as Parameters<
    Awaited<ReturnType<typeof reportService>>["createAdminReport"]
  >[0];
}

/**
 * `createdAt` is written by the timestamps plugin, and reports created inside
 * one test land in the same millisecond often enough that a `sort` assertion
 * would be a coin flip. `timestamps: false` stops the plugin stamping the
 * value straight back over the one being set.
 */
async function backdate(id: Types.ObjectId, createdAt: Date) {
  await Report.findByIdAndUpdate(id, { createdAt }, { timestamps: false });
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

describe("createShopReport", () => {
  it("addresses the report to the shop owner of the shop named in the URL", async () => {
    const { createShopReport } = await reportService();
    await seedShop("Alpha", SHOP_A);
    await seedOrder();

    const report = await createShopReport("Alpha", shopReportInput());

    expect(report.receiver).toBe(Role.SHOP_OWNER);
    expect(report.shopId?.toString()).toBe(SHOP_A.toString());
    expect(report.message).toBe("The order arrived cold and late.");
  });

  it("refuses a shop name nobody owns and stores nothing", async () => {
    const { createShopReport } = await reportService();

    await expect(
      createShopReport("NoSuchShop", shopReportInput()),
    ).rejects.toThrow("Shop not found");

    expect(await Report.countDocuments({})).toBe(0);
  });

  it("refuses an order that belongs to a different shop", async () => {
    const { createShopReport } = await reportService();
    await seedShop("Alpha", SHOP_A);
    await seedShop("Beta", SHOP_B);
    // `orderNumber` is globally unique, so this is the real cross-tenant
    // scenario: a genuine order, genuine customer details, wrong restaurant.
    // Without the `shopId` term in the lookup, Beta's customer could file a
    // complaint into Alpha's dashboard quoting a real order Alpha never saw.
    await seedOrder({ shopId: SHOP_B, orderNumber: 2002 });

    await expect(
      createShopReport("Alpha", shopReportInput({ orderNumber: 2002 })),
    ).rejects.toThrow("Order not found");

    expect(await Report.countDocuments({})).toBe(0);
  });

  it("refuses an order number that does not exist", async () => {
    const { createShopReport } = await reportService();
    await seedShop("Alpha", SHOP_A);
    await seedOrder();

    await expect(
      createShopReport("Alpha", shopReportInput({ orderNumber: 9999 })),
    ).rejects.toThrow("Order not found");
  });

  it.each([
    ["phone number", { phoneNumber: "01099999999" }],
    ["first name", { senderFirstName: "Mona" }],
    ["last name", { senderLastName: "Hassan" }],
  ])(
    "refuses a report whose %s does not match the order",
    async (_field, override) => {
      const { createShopReport } = await reportService();
      await seedShop("Alpha", SHOP_A);
      await seedOrder();

      // Name and phone together are the whole proof of identity on this
      // route — there is no login. Drop any one of the three terms from the
      // lookup and anyone who can guess a sequential order number can post a
      // complaint in a real customer's name.
      await expect(
        createShopReport("Alpha", shopReportInput(override)),
      ).rejects.toThrow("Order not found");

      expect(await Report.countDocuments({})).toBe(0);
    },
  );

  it("ignores a receiver and a shopId supplied in the request body", async () => {
    const { createShopReport } = await reportService();
    await seedShop("Alpha", SHOP_A);
    await seedOrder();

    const report = await createShopReport(
      "Alpha",
      shopReportInput({ receiver: Role.ADMIN, shopId: SHOP_B }),
    );

    // REGRESSION. This route is unauthenticated, so both fields are attacker
    // controlled; the only thing making the URL's shop win is that the
    // service sets `shopId` and `receiver` *after* spreading the body.
    // Reverse the spread and a stranger could drop a report into any shop's
    // dashboard — or set `receiver: ADMIN` to route a complaint away from the
    // restaurant it is about.
    expect(report.receiver).toBe(Role.SHOP_OWNER);
    expect(report.shopId?.toString()).toBe(SHOP_A.toString());
    expect(await Report.countDocuments({ shopId: SHOP_B })).toBe(0);
  });

  it("stores the customer's phone number as a number, losing its leading zero", async () => {
    const { createShopReport } = await reportService();
    await seedShop("Alpha", SHOP_A);
    await seedOrder({ customerPhoneNumber: "01012345678" });

    const report = await createShopReport(
      "Alpha",
      shopReportInput({ phoneNumber: "01012345678" }),
    );

    // CURRENT BEHAVIOUR, not desired behaviour, and this one is live rather
    // than latent. `models/Report.ts` types `phoneNumber` as Number while
    // `models/Order.ts` types `customerPhoneNumber` as String, and the
    // frontend's own review form (`reviewFormSchema.ts`) mandates the
    // Egyptian `01…` format. The order *lookup* above matches, because
    // Mongoose casts the submitted string back to a string for that query —
    // but the value written into the report is cast to a Number, and
    // `Number("01012345678")` is 1012345678. The shop owner's dashboard shows
    // a ten-digit number that cannot be dialled, on the one field whose
    // entire purpose is calling the complaining customer back.
    //
    // Reported rather than fixed: the fix is a schema type change plus a
    // migration for reports already stored this way, and the frontend's
    // `types/report.ts` declares it a number too. Do not "fix" this by
    // changing these assertions.
    expect(report.phoneNumber).toBe(1012345678);

    const stored = await Report.findById(
      (report as { _id: Types.ObjectId })._id,
    ).lean();
    expect(stored?.phoneNumber).toBe(1012345678);
  });
});

describe("createAdminReport", () => {
  it("addresses the report to the admin inbox", async () => {
    const { createAdminReport } = await reportService();

    const report = await createAdminReport(adminReportInput());

    expect(report.receiver).toBe(Role.ADMIN);
    expect(report.shopName).toBe("Alpha");
  });

  it("accepts a shop name that does not exist", async () => {
    const { createAdminReport } = await reportService();

    // Deliberate: this is the landing page's contact form, where `shopName`
    // is free text a prospective owner types about a restaurant that is not
    // on the platform yet. Resolving it against Shops would reject exactly
    // the messages the form exists to collect.
    const report = await createAdminReport(
      adminReportInput({ shopName: "A restaurant you have never heard of" }),
    );

    expect(report.receiver).toBe(Role.ADMIN);
  });

  it("ignores a receiver supplied in the request body", async () => {
    const { createAdminReport } = await reportService();

    const report = await createAdminReport(
      adminReportInput({ receiver: Role.SHOP_OWNER }),
    );

    // REGRESSION, mirroring the shop-report case: unauthenticated route, so
    // `receiver` is attacker controlled, and only the spread order keeps it
    // out. Forging it to SHOP_OWNER would post a stranger's message straight
    // into a restaurant's dashboard from a form that never asks which
    // restaurant.
    expect(report.receiver).toBe(Role.ADMIN);
  });

  it("keeps a shopId smuggled through the body out of that shop's inbox", async () => {
    const { createAdminReport, getAllShopReports } = await reportService();

    await createAdminReport(adminReportInput({ shopId: SHOP_A }));

    // `createAdminReport` spreads the body and does *not* null out `shopId`,
    // so the injected id really is stored on the document. It is harmless
    // only because `getAllShopReports` filters on `receiver` as well as
    // `shopId` — a two-term filter is doing the work of an unset field here.
    // Asserting the inbox rather than the document is the point: this test
    // fails the day someone "simplifies" that query to `{ shopId }`.
    expect(await getAllShopReports(SHOP_A.toString())).toEqual([]);
  });
});

describe("getAllAdminReports", () => {
  it("returns admin reports newest first and leaves shop reports out", async () => {
    const { createAdminReport, createShopReport, getAllAdminReports } =
      await reportService();
    await seedShop("Alpha", SHOP_A);
    await seedOrder();

    const older = await createAdminReport(
      adminReportInput({ message: "Older admin message here." }),
    );
    await backdate(
      (older as { _id: Types.ObjectId })._id,
      new Date("2026-01-01"),
    );
    const newer = await createAdminReport(
      adminReportInput({ message: "Newer admin message here." }),
    );
    await backdate(
      (newer as { _id: Types.ObjectId })._id,
      new Date("2026-06-01"),
    );
    await createShopReport("Alpha", shopReportInput());

    const reports = await getAllAdminReports();

    // The admin dashboard is a queue, so ordering is the feature, not a
    // detail; and a shop's complaint leaking into it would show a named
    // customer's phone number to a platform admin who has no reason for it.
    expect(reports).toHaveLength(2);
    expect(reports[0].message).toBe("Newer admin message here.");
    expect(reports[1].message).toBe("Older admin message here.");
  });

  it("returns an empty list when nothing has been submitted", async () => {
    const { getAllAdminReports } = await reportService();

    expect(await getAllAdminReports()).toEqual([]);
  });
});

describe("getAllShopReports", () => {
  it("returns only the requesting shop's reports", async () => {
    const { createShopReport, getAllShopReports } = await reportService();
    await seedShop("Alpha", SHOP_A);
    await seedShop("Beta", SHOP_B);
    await seedOrder({ shopId: SHOP_A, orderNumber: 1001 });
    await seedOrder({
      shopId: SHOP_B,
      orderNumber: 2002,
      customerFirstName: "Mona",
      customerLastName: "Hassan",
      customerPhoneNumber: "01099999999",
    });

    await createShopReport("Alpha", shopReportInput());
    await createShopReport(
      "Beta",
      shopReportInput({
        orderNumber: 2002,
        senderFirstName: "Mona",
        senderLastName: "Hassan",
        phoneNumber: "01099999999",
        message: "Beta's complaint, not Alpha's business.",
      }),
    );

    const alphaInbox = await getAllShopReports(SHOP_A.toString());

    // A report carries a named customer's phone number and their order
    // number, so a leak across this boundary hands one restaurant a
    // competitor's customer list.
    expect(alphaInbox).toHaveLength(1);
    expect(alphaInbox[0].message).toBe("The order arrived cold and late.");
    expect(alphaInbox.some((r) => r.message.includes("Beta's complaint"))).toBe(
      false,
    );
  });

  it("returns the shop's reports newest first", async () => {
    const { getAllShopReports } = await reportService();

    const older = await Report.create({
      receiver: Role.SHOP_OWNER,
      shopId: SHOP_A,
      message: "Older complaint here.",
      phoneNumber: 1012345678,
    });
    await backdate(older._id as Types.ObjectId, new Date("2026-01-01"));
    const newer = await Report.create({
      receiver: Role.SHOP_OWNER,
      shopId: SHOP_A,
      message: "Newer complaint here.",
      phoneNumber: 1012345678,
    });
    await backdate(newer._id as Types.ObjectId, new Date("2026-06-01"));

    const inbox = await getAllShopReports(SHOP_A.toString());

    expect(inbox.map((r) => r.message)).toEqual([
      "Newer complaint here.",
      "Older complaint here.",
    ]);
  });

  it("returns nothing rather than every shop's inbox when given no shopId", async () => {
    const { getAllShopReports } = await reportService();
    await Report.create({
      receiver: Role.SHOP_OWNER,
      shopId: SHOP_A,
      message: "Alpha's complaint.",
      phoneNumber: 1012345678,
    });
    await Report.create({
      receiver: Role.SHOP_OWNER,
      shopId: SHOP_B,
      message: "Beta's complaint.",
      phoneNumber: 1012345678,
    });

    // `new ObjectId(undefined)` mints a *fresh* id rather than producing an
    // empty filter, so an absent `shopId` degrades to "matches nothing"
    // instead of "matches everything". Worth pinning: two sibling services
    // (`getShop`, `getMenuItemsByShop`) build their filter by omission
    // instead and do return every tenant's rows in the same situation — see
    // TECH_DEBT.md. This one is safe by accident of the cast, and the
    // assertion is what keeps it that way.
    const inbox = await getAllShopReports(undefined as unknown as string);

    expect(inbox).toEqual([]);
  });

  it("returns an empty list for a shop with no reports", async () => {
    const { getAllShopReports } = await reportService();

    expect(await getAllShopReports(SHOP_A.toString())).toEqual([]);
  });
});
