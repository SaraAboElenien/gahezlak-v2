import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import type { Types } from "mongoose";
import { CategoryModel } from "../../models/Category";
import { MenuItemModel } from "../../models/MenuItem";
import { Shops } from "../../models/Shop";
import {
  connectTestDB,
  disconnectTestDB,
  clearTestDB,
} from "../db-test-helper";

/**
 * Service-level coverage for the category service: the section headings a
 * shop's menu is grouped under.
 *
 * A category looks like the least interesting document in the app — two
 * bilingual strings and an owner — but it sits on the public menu, and every
 * one of these five functions is addressed by an id lifted straight out of a
 * URL and paired with the caller's own `shopId`. That pairing is the entire
 * tenancy boundary. Two things follow, and both shape the tests below:
 *
 *   - Cross-tenant assertions never stop at "it threw". A category that a
 *     competitor was refused access to must still exist, still be named what
 *     its owner named it, and still belong to its owner afterwards.
 *   - `updateCategory` takes `req.body` wholesale, and `shopId` is a real
 *     schema path that `updateCategoryValidator` does not name. That is the
 *     same mass-assignment shape already fixed twice in this project (menu
 *     items, shops), so it is tested from both directions: the escalation is
 *     refused, *and* an ordinary rename still saves. A previous allowlist in
 *     this repo shipped stripping legitimate fields from every update while
 *     still returning 200, because the test only asserted fields that happened
 *     to be on the list.
 *
 * Nothing is mocked. Two of the findings below (Mongoose dropping `undefined`
 * out of a `$or` branch, and a nested-path update merging rather than
 * replacing) are driver behaviours that no mocked model could reproduce.
 */

const SHOP_A = new mongoose.Types.ObjectId();
const SHOP_B = new mongoose.Types.ObjectId();

const categoryService = () => import("../../services/category.service");

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

async function seedCategory(
  overrides: {
    shopId?: Types.ObjectId;
    name?: { en: string; ar: string };
    description?: { en: string; ar: string };
  } = {},
) {
  return CategoryModel.create({
    shopId: SHOP_A,
    name: { en: "Mains", ar: "أطباق رئيسية" },
    ...overrides,
  });
}

async function seedItem(
  categoryId: Types.ObjectId,
  shopId: Types.ObjectId = SHOP_A,
) {
  return MenuItemModel.create({
    shopId,
    name: { en: "Burger", ar: "برجر" },
    price: 100,
    categoryId,
    isAvailable: true,
  });
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

describe("createCategory", () => {
  it("files the category under the shop it was called for, not one named in the payload", async () => {
    const { createCategory } = await categoryService();

    const created = await createCategory(SHOP_A.toString(), {
      name: { en: "Mains", ar: "أطباق رئيسية" },
      // The controller passes `req.body` straight through, and `shopId` is a
      // real schema path — nothing upstream strips it. The spread order in
      // the service (`{ ...categoryData, shopId }`) is what makes the
      // caller's token win. Reverse it and any shop could publish headings
      // onto a competitor's public menu.
      shopId: SHOP_B,
    } as Parameters<typeof createCategory>[1]);

    expect(created.shopId.toString()).toBe(SHOP_A.toString());
    expect(await CategoryModel.countDocuments({ shopId: SHOP_B })).toBe(0);
  });

  it("stores both languages and the optional description", async () => {
    const { createCategory } = await categoryService();

    const created = await createCategory(SHOP_A.toString(), {
      name: { en: "Drinks", ar: "مشروبات" },
      description: { en: "Cold and hot", ar: "بارد وساخن" },
    } as Parameters<typeof createCategory>[1]);

    // The public menu renders whichever language the visitor asked for, so a
    // half-stored name shows an empty heading to half the customers.
    const stored = await CategoryModel.findById(created._id).lean();
    expect(stored?.name).toEqual({ en: "Drinks", ar: "مشروبات" });
    expect(stored?.description).toEqual({
      en: "Cold and hot",
      ar: "بارد وساخن",
    });
  });

  it.each([
    ["English", { en: "Mains", ar: "مختلف" }],
    ["Arabic", { en: "Different", ar: "أطباق رئيسية" }],
  ])(
    "refuses a name that collides in %s with an existing category",
    async (_lang, name) => {
      const { createCategory } = await categoryService();
      await seedCategory();

      await expect(
        createCategory(SHOP_A.toString(), { name } as Parameters<
          typeof createCategory
        >[1]),
      ).rejects.toThrow("A category with this name already exists");

      expect(await CategoryModel.countDocuments({ shopId: SHOP_A })).toBe(1);
    },
  );

  it("lets a different shop use a name another shop already took", async () => {
    const { createCategory } = await categoryService();
    await seedCategory({ shopId: SHOP_A });

    // The uniqueness check is deliberately shop-scoped. If it were global,
    // the first restaurant to create "Mains" would lock the word out of the
    // platform for everyone else.
    const created = await createCategory(SHOP_B.toString(), {
      name: { en: "Mains", ar: "أطباق رئيسية" },
    } as Parameters<typeof createCategory>[1]);

    expect(created.shopId.toString()).toBe(SHOP_B.toString());
    expect(await CategoryModel.countDocuments({})).toBe(2);
  });
});

describe("updateCategory", () => {
  it("saves an ordinary edit to every field the update form submits", async () => {
    const { updateCategory } = await categoryService();
    const category = await seedCategory();

    const updated = await updateCategory(
      SHOP_A.toString(),
      category._id.toString(),
      {
        name: { en: "Main Courses", ar: "الأطباق الرئيسية" },
        description: { en: "Our best", ar: "الأفضل لدينا" },
      } as Parameters<typeof updateCategory>[2],
    );

    // This is the other half of the allowlist below, and the half this
    // project has already got wrong once: an allowlist built from a validator
    // silently dropped every field the validator did not happen to name,
    // while the request still returned 200 and a success toast. Every field
    // `updateCategoryValidator` accepts is asserted here on the *stored*
    // document, so a too-narrow list fails loudly instead of shipping.
    expect(updated.name).toEqual({
      en: "Main Courses",
      ar: "الأطباق الرئيسية",
    });
    expect(updated.description).toEqual({ en: "Our best", ar: "الأفضل لدينا" });

    const stored = await CategoryModel.findById(category._id).lean();
    expect(stored?.name).toEqual({
      en: "Main Courses",
      ar: "الأطباق الرئيسية",
    });
    expect(stored?.description).toEqual({ en: "Our best", ar: "الأفضل لدينا" });
  });

  it("does not let the request body move the category onto another shop's menu", async () => {
    const { updateCategory } = await categoryService();
    const category = await seedCategory({ shopId: SHOP_A });

    await updateCategory(SHOP_A.toString(), category._id.toString(), {
      name: { en: "Mains", ar: "أطباق رئيسية" },
      shopId: SHOP_B,
    } as Parameters<typeof updateCategory>[2]);

    // REGRESSION. `updateCategoryValidator` names only `name.*` and
    // `description.*`, and express-validator does not strip the keys it does
    // not name — so before the allowlist, a shop manager could PATCH
    // `{"shopId": "<competitor>"}` and have the `{ _id, shopId }` filter match
    // on their own shop while writing the competitor's id into the document.
    // The heading then vanished from their own menu and appeared, unremovable
    // by its new "owner", on the competitor's public menu. Same class as the
    // menu-item and shop-ownership holes fixed on 2026-08-05.
    const stored = await CategoryModel.findById(category._id).lean();
    expect(stored?.shopId.toString()).toBe(SHOP_A.toString());
    expect(await CategoryModel.countDocuments({ shopId: SHOP_B })).toBe(0);
  });

  it("refuses to update another shop's category and leaves it untouched", async () => {
    const { updateCategory } = await categoryService();
    const foreign = await seedCategory({
      shopId: SHOP_B,
      name: { en: "Desserts", ar: "حلويات" },
    });

    await expect(
      updateCategory(SHOP_A.toString(), foreign._id.toString(), {
        name: { en: "Vandalised", ar: "مخرب" },
      } as Parameters<typeof updateCategory>[2]),
    ).rejects.toThrow("Category not found");

    // "It threw" is not the assertion that matters — the competitor's heading
    // still reading what its owner named it is.
    const stored = await CategoryModel.findById(foreign._id).lean();
    expect(stored?.name).toEqual({ en: "Desserts", ar: "حلويات" });
  });

  it("refuses a rename that collides with another category in the same shop", async () => {
    const { updateCategory } = await categoryService();
    await seedCategory({ name: { en: "Mains", ar: "أطباق رئيسية" } });
    const drinks = await seedCategory({
      name: { en: "Drinks", ar: "مشروبات" },
    });

    await expect(
      updateCategory(SHOP_A.toString(), drinks._id.toString(), {
        name: { en: "Mains", ar: "مشروبات" },
      } as Parameters<typeof updateCategory>[2]),
    ).rejects.toThrow("A category with this name already exists");
  });

  it("lets a category keep its own name when only the description changes", async () => {
    const { updateCategory } = await categoryService();
    const category = await seedCategory();

    // The duplicate check excludes the row being edited (`_id: { $ne: ... }`).
    // Without that, resubmitting the edit form unchanged — which is what a
    // user does when they only touched the description — would report the
    // category as a duplicate of itself.
    const updated = await updateCategory(
      SHOP_A.toString(),
      category._id.toString(),
      {
        name: { en: "Mains", ar: "أطباق رئيسية" },
        description: { en: "Updated", ar: "محدث" },
      } as Parameters<typeof updateCategory>[2],
    );

    expect(updated.description).toEqual({ en: "Updated", ar: "محدث" });
  });

  it("does not treat another shop's identical name as a collision", async () => {
    const { updateCategory } = await categoryService();
    await seedCategory({
      shopId: SHOP_B,
      name: { en: "Drinks", ar: "مشروبات" },
    });
    const own = await seedCategory({ shopId: SHOP_A });

    const updated = await updateCategory(
      SHOP_A.toString(),
      own._id.toString(),
      { name: { en: "Drinks", ar: "مشروبات" } } as Parameters<
        typeof updateCategory
      >[2],
    );

    expect(updated.name.en).toBe("Drinks");
  });

  it.each([
    [
      "English",
      { en: "Beverages" },
      { en: "Beverages", ar: "أطباق رئيسية" } as const,
    ],
    ["Arabic", { ar: "مشروبات" }, { en: "Mains", ar: "مشروبات" } as const],
  ])(
    "renames the %s name without deleting the other language",
    async (_lang, submitted, expected) => {
      const { updateCategory } = await categoryService();
      const category = await seedCategory();

      const updated = await updateCategory(
        SHOP_A.toString(),
        category._id.toString(),
        { name: submitted } as Parameters<typeof updateCategory>[2],
      );

      // REGRESSION. `updateCategoryValidator` marks `name.en` and `name.ar`
      // each `.optional()`, so submitting one language alone is valid input —
      // but `name` is a nested path, and Mongoose *replaces* a nested object
      // in an update rather than merging it. Passing the pair through whole
      // therefore deleted the other language, and because `findOneAndUpdate`
      // runs no validators here the document was left violating its own
      // `name.ar: { required: true }` schema with nothing reporting it. The
      // Arabic public menu then rendered an empty heading over a whole
      // section. The service now flattens the pair onto dotted paths so an
      // update only touches the keys it was actually given.
      expect(updated.name).toEqual(expected);

      const stored = await CategoryModel.findById(category._id).lean();
      expect(stored?.name).toEqual(expected);
    },
  );

  it("merges a one-language description edit instead of dropping the other", async () => {
    const { updateCategory } = await categoryService();
    const category = await seedCategory({
      description: { en: "Cold and hot", ar: "بارد وساخن" },
    });

    const updated = await updateCategory(
      SHOP_A.toString(),
      category._id.toString(),
      { description: { ar: "بارد فقط" } } as Parameters<
        typeof updateCategory
      >[2],
    );

    // `description` is the same bilingual shape as `name` and was broken the
    // same way; it is fixed by the same flattening rather than by a special
    // case, so it is asserted here to stop a future narrowing of that loop.
    expect(updated.description).toEqual({ en: "Cold and hot", ar: "بارد فقط" });
  });

  it("still replaces both languages when both are submitted", async () => {
    const { updateCategory } = await categoryService();
    const category = await seedCategory();

    const updated = await updateCategory(
      SHOP_A.toString(),
      category._id.toString(),
      { name: { en: "Beverages", ar: "مشروبات" } } as Parameters<
        typeof updateCategory
      >[2],
    );

    // The other direction of the merge fix. Merging must not become "the old
    // value wins": a deliberate rename of both languages has to overwrite
    // both, or an owner correcting a typo would find the old text still there.
    expect(updated.name).toEqual({ en: "Beverages", ar: "مشروبات" });

    const stored = await CategoryModel.findById(category._id).lean();
    expect(stored?.name).toEqual({ en: "Beverages", ar: "مشروبات" });
  });

  it("throws NotFound for a category id that does not exist", async () => {
    const { updateCategory } = await categoryService();

    await expect(
      updateCategory(
        SHOP_A.toString(),
        new mongoose.Types.ObjectId().toString(),
        { description: { en: "x", ar: "س" } } as Parameters<
          typeof updateCategory
        >[2],
      ),
    ).rejects.toThrow("Category not found");
  });
});

describe("deleteCategory", () => {
  it("deletes the shop's own category and returns it", async () => {
    const { deleteCategory } = await categoryService();
    const category = await seedCategory();

    const deleted = await deleteCategory(
      SHOP_A.toString(),
      category._id.toString(),
    );

    expect(deleted._id.toString()).toBe(category._id.toString());
    expect(await CategoryModel.countDocuments({})).toBe(0);
  });

  it("refuses to delete another shop's category, which survives intact", async () => {
    const { deleteCategory } = await categoryService();
    const foreign = await seedCategory({ shopId: SHOP_B });

    await expect(
      deleteCategory(SHOP_A.toString(), foreign._id.toString()),
    ).rejects.toThrow("Category not found");

    // Deletion is unrecoverable, so the surviving row is the whole point of
    // the test — a thrown error with the document already gone would still
    // pass a `rejects.toThrow()`-only assertion.
    expect(await CategoryModel.countDocuments({ _id: foreign._id })).toBe(1);
  });

  it("refuses to delete a category that still holds menu items, and destroys nothing", async () => {
    const { deleteCategory } = await categoryService();
    const category = await seedCategory();
    const item = await seedItem(category._id);

    await expect(
      deleteCategory(SHOP_A.toString(), category._id.toString()),
    ).rejects.toThrow("This category still contains menu items");

    // The service used to delete the category and then run
    // `MenuItemModel.updateMany({ category: categoryId }, { category: null,
    // isAvailable: false })` — a filter naming a path the schema does not have
    // (`categoryId` is the real one), so it matched nothing on every call and
    // the items were left pointing at a heading that no longer existed.
    // Renaming the field would have made it destructive instead of dead:
    // `categoryId` is `required: true`, so `null` is not a storable state, and
    // hiding the dishes would have taken a whole section off the public menu
    // with no way for the owner to find them again — the dashboard groups by
    // category, and the category is gone. Refusing is the only outcome that
    // can be undone by doing nothing.
    //
    // Both sides are asserted deliberately. A test that only checked the
    // throw would still pass if the category had already been deleted before
    // the count ran, which is exactly the ordering bug worth guarding against.
    expect(await CategoryModel.countDocuments({ _id: category._id })).toBe(1);
    const storedItem = await MenuItemModel.findById(item._id).lean();
    expect(storedItem?.categoryId.toString()).toBe(category._id.toString());
    expect(storedItem?.isAvailable).toBe(true);
  });

  it("deletes the category once its last item has been moved or removed", async () => {
    const { deleteCategory } = await categoryService();
    const category = await seedCategory();
    const item = await seedItem(category._id);

    await MenuItemModel.deleteOne({ _id: item._id });

    // The other direction: the guard must clear as soon as the shop empties
    // the category, or the refusal becomes a category that can never be
    // deleted at all.
    const deleted = await deleteCategory(
      SHOP_A.toString(),
      category._id.toString(),
    );

    expect(deleted._id.toString()).toBe(category._id.toString());
    expect(await CategoryModel.countDocuments({})).toBe(0);
  });

  it("ignores another shop's items when deciding whether the category is empty", async () => {
    const { deleteCategory } = await categoryService();
    const category = await seedCategory({ shopId: SHOP_A });
    // `updateMenuItem` allows an item's `categoryId` to be changed without
    // checking the new category belongs to the same shop, so a foreign item
    // pointing here is reachable today. Counting it would let any shop
    // permanently block a competitor's category deletion with an error the
    // victim cannot act on — they cannot see, move or delete that item.
    await seedItem(category._id, SHOP_B);

    const deleted = await deleteCategory(
      SHOP_A.toString(),
      category._id.toString(),
    );

    expect(deleted._id.toString()).toBe(category._id.toString());
  });

  it("reports another shop's non-empty category as not found, not as non-empty", async () => {
    const { deleteCategory } = await categoryService();
    const foreign = await seedCategory({ shopId: SHOP_B });
    await seedItem(foreign._id, SHOP_B);

    // Ownership has to be resolved before emptiness. "This category still
    // contains menu items" would confirm to a competitor both that the id
    // exists and that there is something on it — two facts they have no right
    // to either.
    await expect(
      deleteCategory(SHOP_A.toString(), foreign._id.toString()),
    ).rejects.toThrow("Category not found");

    expect(await CategoryModel.countDocuments({ _id: foreign._id })).toBe(1);
  });
});

describe("getCategoriesByShop", () => {
  it("returns only the requesting shop's categories when given a shopId", async () => {
    const { getCategoriesByShop } = await categoryService();
    await seedCategory({ shopId: SHOP_A, name: { en: "Mine", ar: "لي" } });
    await seedCategory({ shopId: SHOP_B, name: { en: "Theirs", ar: "لهم" } });

    const categories = await getCategoriesByShop({
      shopId: SHOP_A.toString(),
      lang: "en",
    });

    expect(categories).toHaveLength(1);
    expect(categories[0].name.en).toBe("Mine");
  });

  it("resolves a public shop name to its own categories only", async () => {
    const { getCategoriesByShop } = await categoryService();
    await seedShop("Alpha", SHOP_A);
    await seedShop("Beta", SHOP_B);
    await seedCategory({ shopId: SHOP_A, name: { en: "Mine", ar: "لي" } });
    await seedCategory({ shopId: SHOP_B, name: { en: "Theirs", ar: "لهم" } });

    // This is the unauthenticated route a customer hits after scanning a QR
    // code, so the shop-name lookup is the only thing scoping the result.
    const categories = await getCategoriesByShop({
      shopName: "Alpha",
      lang: "en",
    });

    expect(categories).toHaveLength(1);
    expect(categories[0].name.en).toBe("Mine");
  });

  it("omits shopId from the response", async () => {
    const { getCategoriesByShop } = await categoryService();
    await seedCategory({ shopId: SHOP_A });

    const categories = await getCategoriesByShop({
      shopId: SHOP_A.toString(),
      lang: "en",
    });

    // The projection is the only thing keeping an internal owner id out of a
    // public response, and no feature would break if it were deleted.
    expect(categories[0]).not.toHaveProperty("shopId");
  });

  it("throws NotFound for a shop name nobody owns", async () => {
    const { getCategoriesByShop } = await categoryService();

    await expect(
      getCategoriesByShop({ shopName: "NoSuchShop", lang: "en" }),
    ).rejects.toThrow("Shop not found");
  });

  it("returns an empty list for a shop with no categories rather than throwing", async () => {
    const { getCategoriesByShop } = await categoryService();
    await seedCategory({ shopId: SHOP_B });

    const categories = await getCategoriesByShop({
      shopId: SHOP_A.toString(),
      lang: "en",
    });

    expect(categories).toEqual([]);
  });

  it("refuses to guess when given no selector at all", async () => {
    const { getCategoriesByShop } = await categoryService();
    await seedCategory({ shopId: SHOP_A, name: { en: "Mine", ar: "لي" } });
    await seedCategory({ shopId: SHOP_B, name: { en: "Theirs", ar: "لهم" } });

    // Regression test: with neither `shopId` nor `shopName` the filter used
    // to collapse to `{}`, a cross-tenant read of the whole platform's menu
    // structure. "No selector" must mean "not found", not "every shop". See
    // TECH_DEBT.md, "multi-tenant queries return everything when given no
    // selector".
    await expect(getCategoriesByShop({ lang: "en" })).rejects.toThrow(
      "A shop id or shop name is required.",
    );
  });
});

describe("getCategoryById", () => {
  it("returns the shop's own category without its shopId", async () => {
    const { getCategoryById } = await categoryService();
    const category = await seedCategory();

    const found = await getCategoryById(
      SHOP_A.toString(),
      category._id.toString(),
    );

    expect(found._id.toString()).toBe(category._id.toString());
    expect(found).not.toHaveProperty("shopId");
  });

  it("refuses to read another shop's category", async () => {
    const { getCategoryById } = await categoryService();
    const foreign = await seedCategory({ shopId: SHOP_B });

    // `createMenuItem` calls this function as its only tenancy check before
    // hanging an item off a category, so a leak here is a leak there too.
    await expect(
      getCategoryById(SHOP_A.toString(), foreign._id.toString()),
    ).rejects.toThrow("Category not found");
  });

  it("throws NotFound for a category id that does not exist", async () => {
    const { getCategoryById } = await categoryService();

    await expect(
      getCategoryById(
        SHOP_A.toString(),
        new mongoose.Types.ObjectId().toString(),
      ),
    ).rejects.toThrow("Category not found");
  });
});
