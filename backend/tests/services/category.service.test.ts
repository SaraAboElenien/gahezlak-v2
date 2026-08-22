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

  it("wipes the Arabic name when only the English one is submitted", async () => {
    const { updateCategory } = await categoryService();
    const category = await seedCategory();

    const updated = await updateCategory(
      SHOP_A.toString(),
      category._id.toString(),
      { name: { en: "Beverages" } } as Parameters<typeof updateCategory>[2],
    );

    // CURRENT BEHAVIOUR, not desired behaviour. `updateCategoryValidator`
    // marks `name.en` and `name.ar` each `.optional()`, so submitting one
    // language alone is valid input — but `name` is a nested path, and
    // Mongoose *replaces* a nested object in an update rather than merging it
    // into dotted paths. The Arabic heading is deleted, and because
    // `findOneAndUpdate` does not run validators the document is left
    // violating its own `name.ar: { required: true }` schema. The Arabic
    // public menu then renders an empty heading for that section.
    //
    // Latent from the app today — `frontend/src/types/validations/menu/
    // category.ts` requires both languages, so the real form never sends one
    // — but the API contract permits it, which is the same shape as the
    // "negative price" finding already recorded for menu items. Reported
    // rather than fixed here because the right fix is a decision, not a
    // rename: merge onto dotted paths, or make the validator require both
    // languages whenever `name` is present. Do not "fix" this by changing
    // these assertions.
    expect(updated.name.ar).toBeUndefined();

    const stored = await CategoryModel.findById(category._id).lean();
    expect(stored?.name).toEqual({ en: "Beverages" });
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

  it("leaves the deleted category's menu items pointing at a category that no longer exists", async () => {
    const { deleteCategory } = await categoryService();
    const category = await seedCategory();
    const item = await MenuItemModel.create({
      shopId: SHOP_A,
      name: { en: "Burger", ar: "برجر" },
      price: 100,
      categoryId: category._id,
      isAvailable: true,
    });

    await deleteCategory(SHOP_A.toString(), category._id.toString());

    // CURRENT BEHAVIOUR, not desired behaviour. The service runs
    // `MenuItemModel.updateMany({ category: categoryId }, ...)` intending to
    // orphan and hide the items, but the schema field is `categoryId` — the
    // filter has always matched nothing, so the cleanup has never once run.
    // Already logged in TECH_DEBT.md ("Deleting a menu item or a category
    // leaves the other side dangling"); left alone here because the fix needs
    // a product decision about what deletion *should* do to the items
    // (orphan, reassign, or refuse while non-empty), not just a field rename.
    // These assertions pin the status quo so that decision shows up as a
    // failing test rather than a silent behaviour change.
    const stored = await MenuItemModel.findById(item._id).lean();
    expect(stored?.categoryId.toString()).toBe(category._id.toString());
    expect(stored?.isAvailable).toBe(true);
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

  it("returns every shop's categories when given no selector at all", async () => {
    const { getCategoriesByShop } = await categoryService();
    await seedCategory({ shopId: SHOP_A, name: { en: "Mine", ar: "لي" } });
    await seedCategory({ shopId: SHOP_B, name: { en: "Theirs", ar: "لهم" } });

    const categories = await getCategoriesByShop({ lang: "en" });

    // CURRENT BEHAVIOUR, not desired behaviour. With neither `shopId` nor
    // `shopName` the filter is `{}`, so this is a cross-tenant read of the
    // whole platform's menu structure. It is the third instance of the shape
    // already logged in TECH_DEBT.md as "Two multi-tenant queries return
    // everything when given no selector" (`getShop`, `getMenuItemsByShop`) —
    // reported rather than fixed here so all three are closed together by the
    // same decision, since fixing one in isolation leaves the pattern alive
    // and the entry stale.
    //
    // Latent today: the public route always supplies `:shopName` from its own
    // path, and the authenticated route is behind `isShopMember`, which
    // rejects a token carrying no `shopId`. The guard is a property of the
    // callers, not of this function.
    expect(categories).toHaveLength(2);
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
