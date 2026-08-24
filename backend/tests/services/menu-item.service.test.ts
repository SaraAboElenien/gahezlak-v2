import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import type { Types } from "mongoose";
import type { IMenuItem } from "../../models/MenuItem";
import { MenuItemModel } from "../../models/MenuItem";
import { CategoryModel } from "../../models/Category";
import { Shops } from "../../models/Shop";
import {
  connectTestDB,
  disconnectTestDB,
  clearTestDB,
} from "../db-test-helper";

/**
 * Service-level coverage for the menu-item service: a shop's product
 * catalogue, and the only place in the app where a price is ever authored.
 *
 * Everything below is one of two concerns.
 *
 * Tenancy first. Every read and every write is scoped by `shopId`, and that
 * one filter is the whole defence against a restaurant editing, hiding or
 * deleting a competitor's menu — the IDOR class this project has already had
 * to fix elsewhere. The interesting assertion is never just "it threw": it is
 * that the other shop's row is still there, still priced, still visible.
 *
 * Money second. CreateOrder recomputes what a customer is charged from the
 * stored `price` and `discountPercentage` of the item (see
 * tests/services/order.service.test.ts), so a wrong number written here is a
 * wrong number on a card.
 *
 * Nothing is mocked. Image upload happens in the controller, not the service,
 * so this module has no network boundary of its own.
 */

const SHOP_A = new mongoose.Types.ObjectId();
const SHOP_B = new mongoose.Types.ObjectId();

const menuItemService = () => import("../../services/menu-item.service");

async function seedCategory(shopId: Types.ObjectId = SHOP_A) {
  return CategoryModel.create({
    shopId,
    name: { en: "Mains", ar: "أطباق رئيسية" },
  });
}

async function seedShop(name: string, _id: Types.ObjectId) {
  return Shops.create({
    _id,
    name,
    type: "restaurant",
    address: { country: "EG", city: "Cairo", street: "1 Main St" },
    phoneNumber: "01000000000",
    email: "shop@example.com",
    ownerId: new mongoose.Types.ObjectId(),
  });
}

async function seedItem(
  overrides: {
    shopId?: Types.ObjectId;
    categoryId?: Types.ObjectId;
    price?: number;
    isAvailable?: boolean;
    discountPercentage?: number;
    createdAt?: Date;
  } = {},
) {
  const { createdAt, ...rest } = overrides;
  const item = await MenuItemModel.create({
    shopId: SHOP_A,
    name: { en: "Burger", ar: "برجر" },
    price: 100,
    categoryId: new mongoose.Types.ObjectId(),
    isAvailable: true,
    discountPercentage: 0,
    ...rest,
  });

  if (createdAt) {
    // timestamps:false so the plugin doesn't stomp the value straight back.
    await MenuItemModel.findByIdAndUpdate(
      item._id,
      { createdAt },
      { timestamps: false },
    );
  }

  return item;
}

type CreateMenuItemInput = Pick<
  IMenuItem,
  "name" | "description" | "price" | "categoryId" | "imgUrl"
> & { discountPercentage: number };

/**
 * The payload createMenuItem accepts, backed by a category that really exists
 * for `shopId`. `overrides` is deliberately untyped so a test can smuggle in a
 * field the signature forbids — the controller builds this object from
 * `req.body`, which is exactly that kind of hostile input.
 */
async function itemInput(
  shopId: Types.ObjectId = SHOP_A,
  overrides: Record<string, unknown> = {},
) {
  const category = await seedCategory(shopId);
  return {
    name: { en: "Burger", ar: "برجر" },
    description: { en: "Beef", ar: "لحم" },
    price: 100,
    categoryId: category._id,
    discountPercentage: 0,
    ...overrides,
  } as unknown as CreateMenuItemInput;
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

describe("createMenuItem", () => {
  it("files the item under the shop it was called for, not one named in the payload", async () => {
    const { createMenuItem } = await menuItemService();
    const payload = await itemInput(SHOP_A, { shopId: SHOP_B });

    const created = await createMenuItem(SHOP_A.toString(), payload);

    // `shopId` comes from the caller's access token; the rest of the object is
    // the request body, which nothing strips (express-validator only validates
    // the fields it names). The spread order in the service is what makes the
    // token win — reverse it and any shop could publish items into another
    // shop's menu.
    const stored = await MenuItemModel.findById(created._id).lean();
    expect(stored?.shopId.toString()).toBe(SHOP_A.toString());
  });

  it("refuses a category belonging to another shop", async () => {
    const { createMenuItem } = await menuItemService();
    const foreignCategory = await seedCategory(SHOP_B);

    // The category lookup is the only tenancy check on this path, so it is
    // also the only thing stopping a shop from hanging its items off a
    // competitor's category tree.
    await expect(
      createMenuItem(
        SHOP_A.toString(),
        await itemInput(SHOP_A, { categoryId: foreignCategory._id }),
      ),
    ).rejects.toThrow("Category not found");

    expect(await MenuItemModel.countDocuments({})).toBe(0);
  });

  it("refuses a category that does not exist, leaving nothing behind", async () => {
    const { createMenuItem } = await menuItemService();

    await expect(
      createMenuItem(
        SHOP_A.toString(),
        await itemInput(SHOP_A, {
          categoryId: new mongoose.Types.ObjectId(),
        }),
      ),
    ).rejects.toThrow("Category not found");

    // A half-created item would show up on the public menu attached to no
    // category at all.
    expect(await MenuItemModel.countDocuments({})).toBe(0);
  });

  it("stores the discount beside the full price rather than pre-applying it", async () => {
    const { createMenuItem } = await menuItemService();

    const created = await createMenuItem(
      SHOP_A.toString(),
      await itemInput(SHOP_A, { price: 200, discountPercentage: 25 }),
    );

    // CreateOrder charges `price * (1 - discountPercentage/100)`. If the
    // service ever "helpfully" stored 150 here, every order would take the
    // 25% off a second time and the shop would silently eat the difference.
    const stored = await MenuItemModel.findById(created._id).lean();
    expect(stored?.price).toBe(200);
    expect(stored?.discountPercentage).toBe(25);
  });

  it("defaults a new item to available with no discount", async () => {
    const { createMenuItem } = await menuItemService();

    const created = await createMenuItem(SHOP_A.toString(), await itemInput());

    // Both defaults are load-bearing: an undefined discount would make the
    // order total NaN, and an undefined availability would hide the item from
    // the public menu, which filters on `isAvailable: true`.
    expect(created.isAvailable).toBe(true);
    expect(created.discountPercentage).toBe(0);
  });

  it.each([101, -1])(
    "rejects a discount of %s percent and stores nothing",
    async (discountPercentage) => {
      const { createMenuItem } = await menuItemService();

      await expect(
        createMenuItem(
          SHOP_A.toString(),
          await itemInput(SHOP_A, { discountPercentage }),
        ),
      ).rejects.toThrow();

      // The 0-100 bound is enforced by the schema on insert. Above 100 the
      // computed line price goes negative and *subtracts* from the order
      // total; below 0 it inflates the charge past the advertised price.
      expect(await MenuItemModel.countDocuments({})).toBe(0);
    },
  );

  it("accepts a negative price, which only the route validator rejects", async () => {
    const { createMenuItem } = await menuItemService();

    const created = await createMenuItem(
      SHOP_A.toString(),
      await itemInput(SHOP_A, { price: -50 }),
    );

    // CURRENT BEHAVIOUR, not desired behaviour: `price` carries no `min` in
    // the schema, so the express-validator rule on POST /shops/menu-items
    // (`isFloat({ min: 0 })`) is the single guard. A negative price would
    // reduce an order's total, so anything that ever writes an item without
    // going through that route — a seed script, an import, the AI menu
    // extractor — has nothing catching it. Reported; do not "fix" by changing
    // this assertion.
    expect(created.price).toBe(-50);
  });
});

describe("getMenuItemById", () => {
  it("returns the shop's own item", async () => {
    const { getMenuItemById } = await menuItemService();
    const item = await seedItem({ price: 100 });

    const found = await getMenuItemById(
      SHOP_A.toString(),
      item._id.toString(),
      "en",
    );

    expect(found._id.toString()).toBe(item._id.toString());
    expect(found.price).toBe(100);
  });

  it("hides another shop's item behind the same not-found error", async () => {
    const { getMenuItemById } = await menuItemService();
    const item = await seedItem({ shopId: SHOP_B });

    // Must be indistinguishable from a missing id: a different error would
    // confirm the id exists and let one shop map another's catalogue.
    await expect(
      getMenuItemById(SHOP_A.toString(), item._id.toString(), "en"),
    ).rejects.toThrow("Menu item not found");
  });

  it("throws for an item that does not exist", async () => {
    const { getMenuItemById } = await menuItemService();

    await expect(
      getMenuItemById(
        SHOP_A.toString(),
        new mongoose.Types.ObjectId().toString(),
        "en",
      ),
    ).rejects.toThrow("Menu item not found");
  });
});

describe("deleteMenuItem", () => {
  it("deletes the shop's own item and hands back what it removed", async () => {
    const { deleteMenuItem } = await menuItemService();
    const item = await seedItem();

    const deleted = await deleteMenuItem(
      SHOP_A.toString(),
      item._id.toString(),
    );

    expect(deleted._id.toString()).toBe(item._id.toString());
    expect(await MenuItemModel.countDocuments({})).toBe(0);
  });

  it("cannot delete another shop's item, and leaves it on their menu", async () => {
    const { deleteMenuItem } = await menuItemService();
    const foreign = await seedItem({ shopId: SHOP_B });

    await expect(
      deleteMenuItem(SHOP_A.toString(), foreign._id.toString()),
    ).rejects.toThrow("Menu item not found");

    // The destructive cross-tenant case, and the reason the assertion below
    // matters more than the rejection above: an unscoped delete is
    // unrecoverable, and the victim shop would just find items missing.
    const stored = await MenuItemModel.findById(foreign._id).lean();
    expect(stored).not.toBeNull();
    expect(stored?.shopId.toString()).toBe(SHOP_B.toString());
  });

  it("throws for an item that does not exist", async () => {
    const { deleteMenuItem } = await menuItemService();

    await expect(
      deleteMenuItem(
        SHOP_A.toString(),
        new mongoose.Types.ObjectId().toString(),
      ),
    ).rejects.toThrow("Menu item not found");
  });
});

describe("toggleItemAvailability", () => {
  it("hides and re-shows the shop's own item", async () => {
    const { toggleItemAvailability } = await menuItemService();
    const item = await seedItem({ isAvailable: true });

    const hidden = await toggleItemAvailability(
      SHOP_A.toString(),
      item._id.toString(),
      false,
    );
    expect(hidden.isAvailable).toBe(false);
    expect((await MenuItemModel.findById(item._id).lean())?.isAvailable).toBe(
      false,
    );

    const shown = await toggleItemAvailability(
      SHOP_A.toString(),
      item._id.toString(),
      true,
    );
    expect(shown.isAvailable).toBe(true);
  });

  it("cannot flip availability on another shop's item", async () => {
    const { toggleItemAvailability } = await menuItemService();
    const foreign = await seedItem({ shopId: SHOP_B, isAvailable: true });

    await expect(
      toggleItemAvailability(SHOP_A.toString(), foreign._id.toString(), false),
    ).rejects.toThrow("Menu item not found");

    // Both directions are damaging: flipping a competitor's items off empties
    // their public menu (which filters on `isAvailable`), and flipping them on
    // republishes something they deliberately took down — a sold-out dish
    // customers can then order and pay for.
    expect(
      (await MenuItemModel.findById(foreign._id).lean())?.isAvailable,
    ).toBe(true);
  });

  it("throws for an item that does not exist", async () => {
    const { toggleItemAvailability } = await menuItemService();

    await expect(
      toggleItemAvailability(
        SHOP_A.toString(),
        new mongoose.Types.ObjectId().toString(),
        false,
      ),
    ).rejects.toThrow("Menu item not found");
  });
});

describe("updateMenuItem", () => {
  it("persists the new price and returns the updated document", async () => {
    const { updateMenuItem } = await menuItemService();
    const item = await seedItem({ price: 100, discountPercentage: 0 });

    const updated = await updateMenuItem(
      SHOP_A.toString(),
      item._id.toString(),
      { price: 130, discountPercentage: 10 },
    );

    // `{ new: true }` is what the dashboard renders after a save; returning
    // the pre-update document would show the owner the old price and read as
    // "the change didn't take".
    expect(updated.price).toBe(130);
    expect(updated.discountPercentage).toBe(10);

    const stored = await MenuItemModel.findById(item._id).lean();
    expect(stored?.price).toBe(130);
    expect(stored?.discountPercentage).toBe(10);
  });

  it("cannot reprice another shop's item", async () => {
    const { updateMenuItem } = await menuItemService();
    const foreign = await seedItem({ shopId: SHOP_B, price: 100 });

    await expect(
      updateMenuItem(SHOP_A.toString(), foreign._id.toString(), { price: 1 }),
    ).rejects.toThrow("Menu item not found");

    // Repricing someone else's menu is the quietest attack on this model:
    // nothing looks broken, the victim shop just starts selling at a loss.
    expect((await MenuItemModel.findById(foreign._id).lean())?.price).toBe(100);
  });

  it("throws for an item that does not exist", async () => {
    const { updateMenuItem } = await menuItemService();

    await expect(
      updateMenuItem(
        SHOP_A.toString(),
        new mongoose.Types.ObjectId().toString(),
        { price: 1 },
      ),
    ).rejects.toThrow("Menu item not found");
  });

  /**
   * DEFECT MARKER — flips to passing when the source is fixed; do not delete.
   *
   * `updateData` is `Partial<IMenuItem>`, and updateMenuItemHandler builds it
   * by spreading `req.body` verbatim. `shopId` is a field of IMenuItem and is
   * not named by validateUpdateMenuItem, and express-validator does not strip
   * unlisted keys — so `PATCH /shops/menu-items/:itemId` with
   * `{"shopId": "<another shop>"}` passes the `{ _id, shopId }` filter using
   * the caller's own shop and then writes the *other* shop's id into the
   * document. The item leaves the caller's menu and appears on the victim's,
   * priced by the attacker and orderable by that shop's customers.
   *
   * Fix shape: whitelist the updatable fields in the service (or `$unset`
   * shopId from `updateData`) rather than relying on a validator that only
   * checks the fields it happens to know about.
   */
  it("does not let the update body move the item into another shop", async () => {
    const { updateMenuItem } = await menuItemService();
    const item = await seedItem({ shopId: SHOP_A });

    await updateMenuItem(SHOP_A.toString(), item._id.toString(), {
      shopId: SHOP_B,
    } as unknown as Partial<IMenuItem>);

    const stored = await MenuItemModel.findById(item._id).lean();
    expect(stored?.shopId.toString()).toBe(SHOP_A.toString());
  });

  it("enforces the schema's discount bounds on update", async () => {
    const { updateMenuItem } = await menuItemService();
    const item = await seedItem({ price: 100, discountPercentage: 0 });

    // `findOneAndUpdate` does not run validators unless asked, so the schema's
    // 0-100 bound used to apply on insert but not on any edit. At 500 the line
    // price CreateOrder computes is `100 * (1 - 5) = -400`, which *subtracts*
    // from the order total. It was unreachable through PATCH because the
    // route's express-validator rule bounds it — meaning that route validator
    // was the only thing standing between a seed script, an import or the AI
    // menu extractor and a negative order line. The bound now lives on the
    // write itself.
    await expect(
      updateMenuItem(SHOP_A.toString(), item._id.toString(), {
        discountPercentage: 500,
      }),
    ).rejects.toThrow();

    const { getMenuItemById } = await menuItemService();
    const unchanged = await getMenuItemById(
      SHOP_A.toString(),
      item._id.toString(),
    );
    expect(unchanged.discountPercentage).toBe(0);
  });
});

describe("getMenuItemsByShop", () => {
  it("returns only the requesting shop's items and strips shopId", async () => {
    const { getMenuItemsByShop } = await menuItemService();
    await seedItem();
    await seedItem();
    await seedItem({ shopId: SHOP_B });

    const { items, totalCount } = await getMenuItemsByShop({
      shopId: SHOP_A.toString(),
      lang: "en",
    });

    expect(items).toHaveLength(2);
    expect(totalCount).toBe(2);
    // shopId is projected out so a public menu response never discloses the
    // internal id of the shop it belongs to.
    expect(items[0].shopId).toBeUndefined();
  });

  it("shows the dashboard unavailable items as well as available ones", async () => {
    const { getMenuItemsByShop } = await menuItemService();
    await seedItem({ isAvailable: true });
    await seedItem({ isAvailable: false });

    const { items } = await getMenuItemsByShop({
      shopId: SHOP_A.toString(),
      lang: "en",
    });

    // The authenticated listing is how an owner finds the dish they took down
    // in order to put it back; filtering it out here would strand the item.
    expect(items).toHaveLength(2);
  });

  it("serves the public menu only the available items of the named shop", async () => {
    const { getMenuItemsByShop } = await menuItemService();
    await seedShop("Test Bistro", SHOP_A);
    await seedShop("Rival Bistro", SHOP_B);
    const visible = await seedItem({ isAvailable: true });
    await seedItem({ isAvailable: false });
    await seedItem({ shopId: SHOP_B, isAvailable: true });

    const { items, totalCount } = await getMenuItemsByShop({
      shopName: "Test Bistro",
      lang: "en",
    });

    // This is the unauthenticated route customers scan into. An unavailable
    // item is one the shop has deliberately pulled — surfacing it lets a
    // customer order and pay for something the kitchen cannot make.
    expect(items).toHaveLength(1);
    expect(totalCount).toBe(1);
    expect(items[0]._id.toString()).toBe(visible._id.toString());
  });

  it("throws for a shop name that does not exist", async () => {
    const { getMenuItemsByShop } = await menuItemService();

    await expect(
      getMenuItemsByShop({ shopName: "No Such Shop", lang: "en" }),
    ).rejects.toThrow("Shop not found");
  });

  it("lets shopName override shopId when both are supplied", async () => {
    const { getMenuItemsByShop } = await menuItemService();
    await seedShop("Rival Bistro", SHOP_B);
    await seedItem({ shopId: SHOP_A });
    const rival = await seedItem({ shopId: SHOP_B, isAvailable: true });

    const { items } = await getMenuItemsByShop({
      shopId: SHOP_A.toString(),
      shopName: "Rival Bistro",
      lang: "en",
    });

    // getMenuItemsByShopHandler passes both whenever a logged-in user hits the
    // public `/name/:shopName/menu-items` route. The name winning is correct —
    // that route is meant to serve whichever shop was asked for — but it also
    // means the name, not the token, decides the tenant, so the availability
    // filter above is the only thing narrowing what comes back.
    expect(items).toHaveLength(1);
    expect(items[0]._id.toString()).toBe(rival._id.toString());
  });

  it("refuses to guess when given neither a shop id nor a name", async () => {
    const { getMenuItemsByShop } = await menuItemService();
    await seedItem({ shopId: SHOP_A });
    await seedItem({ shopId: SHOP_B });

    // Regression test: with both arguments absent the filter used to collapse
    // to `{}` and the query spanned every tenant. "No selector" must mean
    // "not found", not "every shop's menu". See TECH_DEBT.md, "multi-tenant
    // queries return everything when given no selector".
    await expect(getMenuItemsByShop({ lang: "en" })).rejects.toThrow(
      "A shop id or shop name is required.",
    );
  });

  it("sorts newest first", async () => {
    const { getMenuItemsByShop } = await menuItemService();
    const base = Date.UTC(2026, 0, 1);
    const oldest = await seedItem({ createdAt: new Date(base) });
    const middle = await seedItem({ createdAt: new Date(base + 60_000) });
    const newest = await seedItem({ createdAt: new Date(base + 120_000) });

    const { items } = await getMenuItemsByShop({
      shopId: SHOP_A.toString(),
      lang: "en",
    });

    expect(items.map((i) => i._id.toString())).toEqual([
      newest._id.toString(),
      middle._id.toString(),
      oldest._id.toString(),
    ]);
  });

  it("paginates with skip and limit while reporting the unpaginated total", async () => {
    const { getMenuItemsByShop } = await menuItemService();
    const base = Date.UTC(2026, 0, 1);
    for (let i = 0; i < 5; i++) {
      await seedItem({ createdAt: new Date(base + i * 60_000) });
    }

    const page1 = await getMenuItemsByShop({
      shopId: SHOP_A.toString(),
      lang: "en",
      skip: 0,
      limit: 2,
    });
    const page3 = await getMenuItemsByShop({
      shopId: SHOP_A.toString(),
      lang: "en",
      skip: 4,
      limit: 2,
    });

    expect(page1.items).toHaveLength(2);
    expect(page3.items).toHaveLength(1);
    // totalCount drives the controller's page count, so it must ignore
    // skip/limit or the dashboard offers pages that do not exist.
    expect(page1.totalCount).toBe(5);
    expect(page3.totalCount).toBe(5);

    const ids = new Set([
      ...page1.items.map((i) => i._id.toString()),
      ...page3.items.map((i) => i._id.toString()),
    ]);
    expect(ids.size).toBe(3);
  });

  it("ignores a limit given without a skip, keeping pagination strictly opt-in", async () => {
    const { getMenuItemsByShop } = await menuItemService();
    for (let i = 0; i < 3; i++) await seedItem();

    const { items } = await getMenuItemsByShop({
      shopId: SHOP_A.toString(),
      lang: "en",
      limit: 1,
    });

    // Both values are required together by design: every current frontend
    // consumer omits page/limit entirely and relies on getting the whole menu
    // back, so a half-specified request must not silently truncate it.
    expect(items).toHaveLength(3);
  });
});
