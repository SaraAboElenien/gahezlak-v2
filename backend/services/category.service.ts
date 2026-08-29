import { ICategory, CategoryModel } from "../models/Category";
import { MenuItemModel } from "../models/MenuItem";
import { Errors } from "../errors";
import { errMsg } from "../common/err-messages";
import mongoose, { FilterQuery, UpdateQuery } from "mongoose";
import { LangType } from "../common/types/general-types";
import { Shops } from "../models/Shop";

export async function createCategory(
  shopId: string,
  categoryData: Partial<ICategory>,
) {
  const existingCategory = await CategoryModel.findOne({
    shopId,
    $or: [
      { "name.en": categoryData.name?.en },
      { "name.ar": categoryData.name?.ar },
    ],
  });

  if (existingCategory) {
    throw new Errors.BadRequestError(errMsg.CATEGORY_ALREADY_EXISTS);
  }

  const category = await CategoryModel.create({
    ...categoryData,
    shopId,
  });
  return category.toObject();
}

/**
 * Fields a category update is permitted to touch — mirrors
 * `updateCategoryValidator`.
 *
 * The allowlist is the security control. `shopId` is an ICategory field that
 * the validator does not name, and express-validator does not strip unlisted
 * keys, so spreading `req.body` into the update let a shop manager move a
 * category onto a shop they do not own: the `{ _id, shopId }` filter matched
 * using their own shop, then wrote someone else's id into the document. The
 * heading disappeared from their own menu and appeared on the other shop's
 * public menu — where its new "owner" could not remove it, because every
 * category route is addressed by their own `shopId`. Same class as the
 * menu-item and shop-ownership holes fixed on 2026-08-05, and proven by
 * `tests/services/category.service.test.ts`.
 */
const UPDATABLE_CATEGORY_FIELDS = [
  "name",
  "description",
] as const satisfies readonly (keyof ICategory)[];

/**
 * Both updatable fields are bilingual `{ en, ar }` pairs, and both are
 * flattened onto dotted paths (`name.en`, `description.ar`) rather than passed
 * through whole.
 *
 * Mongoose *replaces* a nested object in an update instead of merging it, so
 * `{ name: { en: "Beverages" } }` did not rename the English heading — it
 * deleted the Arabic one. `updateCategoryValidator` marks each language
 * `.optional()`, so a one-language body is valid input and has to mean "change
 * this language", and `findOneAndUpdate` runs no validators here, so the write
 * left the document violating its own `name.ar: { required: true }` schema with
 * no error anywhere. The Arabic public menu then rendered an empty heading over
 * a section of the menu.
 *
 * Sending both languages still replaces both, so a deliberate rename is
 * unaffected — dotted paths only narrow *which* keys the update touches.
 */
function pickUpdatableCategoryFields(
  updateData: Partial<ICategory>,
): UpdateQuery<ICategory> {
  const updates: Record<string, unknown> = {};
  for (const field of UPDATABLE_CATEGORY_FIELDS) {
    const value = updateData[field];
    if (value === undefined) continue;

    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      // Not an `{ en, ar }` pair at all — the validator only checks `name.en`
      // and `name.ar`, so a body sending `name: "Drinks"` reaches here. Passed
      // through untouched so Mongoose rejects it, rather than being spread
      // character-by-character into `name.0`, `name.1`, … and quietly stored.
      updates[field] = value;
      continue;
    }

    for (const [lang, text] of Object.entries(value)) {
      if (text !== undefined) updates[`${field}.${lang}`] = text;
    }
  }
  return updates;
}

export async function updateCategory(
  shopId: string,
  categoryId: string,
  updateData: Partial<ICategory>,
) {
  if (updateData.name) {
    const existingCategory = await CategoryModel.findOne({
      _id: { $ne: new mongoose.Types.ObjectId(categoryId) },
      shopId,
      $or: [
        { "name.en": updateData.name.en },
        { "name.ar": updateData.name.ar },
      ],
    });
    if (existingCategory) {
      throw new Errors.BadRequestError(errMsg.CATEGORY_ALREADY_EXISTS);
    }
  }

  const category = await CategoryModel.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(categoryId),
      shopId,
    },
    pickUpdatableCategoryFields(updateData),
    { new: true },
  ).lean();

  if (!category) {
    throw new Errors.NotFoundError(errMsg.CATEGORY_NOT_FOUND);
  }

  return category;
}

/**
 * Deletes a category, but only while it is empty.
 *
 * The old cleanup step read `MenuItemModel.updateMany({ category: categoryId },
 * { category: null, isAvailable: false })`. The schema path is `categoryId`, so
 * that filter matched nothing on every call this service has ever made and the
 * items were simply left pointing at a category that no longer existed. Fixing
 * the field name alone would have been the wrong repair, because it would have
 * turned a no-op into a destructive one: `categoryId` is `required: true`, so
 * `null` is not a state the schema permits, and `isAvailable: false` would have
 * pulled every dish in the section off the public menu with no way for the
 * owner to find them again (the dashboard groups by category, and their
 * category is gone).
 *
 * Of the three possible behaviours — orphan the items, reassign them to a
 * default "Uncategorised" category, or refuse while the category is non-empty —
 * only refusing cannot silently destroy or hide a shop's menu. Orphaning writes
 * a schema-invalid document; reassigning invents a category the owner never
 * created and still moves their menu around behind their back. Refusing costs
 * the owner one extra step and is the only one that is reversible by doing
 * nothing. This codebase's recurring failure mode is safeguards that fail open,
 * so the deletion fails closed.
 */
export async function deleteCategory(shopId: string, categoryId: string) {
  const categoryObjectId = new mongoose.Types.ObjectId(categoryId);

  // Ownership is resolved before emptiness so that a category belonging to
  // another shop reports CATEGORY_NOT_FOUND rather than CATEGORY_NOT_EMPTY —
  // the second answer would confirm both that the id exists and that it has
  // items on it, to a caller with no right to know either.
  const category = await CategoryModel.findOne({
    _id: categoryObjectId,
    shopId,
  });

  if (!category) {
    throw new Errors.NotFoundError(errMsg.CATEGORY_NOT_FOUND);
  }

  // Scoped to the caller's own shop, not to `categoryId` alone: `updateMenuItem`
  // lets an item's `categoryId` be set without checking the new category
  // belongs to the same shop, so a foreign item can point here. Counting those
  // too would let one shop permanently block another's deletion with an error
  // the victim has no way to act on.
  const itemsInCategory = await MenuItemModel.countDocuments({
    shopId: new mongoose.Types.ObjectId(shopId),
    categoryId: categoryObjectId,
  });

  if (itemsInCategory > 0) {
    throw new Errors.BadRequestError(errMsg.CATEGORY_NOT_EMPTY);
  }

  await CategoryModel.deleteOne({ _id: categoryObjectId, shopId });

  return category;
}

// export async function updateItemInCategory(
//   shopId: string,
//   categoryId: string,
//   itemId: string,
//   updateData: Partial<IMenuItem>
// ) {
//   const item = await MenuItemModel.findOneAndUpdate(
//     {
//       _id: new mongoose.Types.ObjectId(itemId),
//       category: new mongoose.Types.ObjectId(categoryId),
//       shopId: new mongoose.Types.ObjectId(shopId),
//     },
//     updateData,
//     { new: true }
//   );

//   if (!item) {
//     throw new Errors.NotFoundError(errMsg.MENU_ITEM_NOT_FOUND);
//   }

//   return item.toObject();
// }

// `lang` is accepted (and passed by every caller) but not yet used: the
// localisation of category documents is still unimplemented.
export async function getCategoriesByShop({
  shopId,
  shopName,
}: {
  shopId?: string;
  shopName?: string;
  lang: LangType;
}) {
  if (!shopId && !shopName) {
    // With neither argument the filter below would collapse to `{}` and
    // return every tenant's categories. "No selector" must mean "not found",
    // not "every shop" — same family as the order IDOR fixed 2026-07-30. See
    // TECH_DEBT.md.
    throw new Errors.BadRequestError(errMsg.SHOP_SELECTOR_REQUIRED);
  }

  const query: FilterQuery<ICategory> = {};

  if (shopId) {
    query.shopId = new mongoose.Types.ObjectId(shopId);
  }

  if (shopName) {
    const shop = await Shops.findOne({ name: shopName }).lean();
    if (!shop) {
      throw new Errors.NotFoundError(errMsg.SHOP_NOT_FOUND);
    }
    query.shopId = shop._id;
  }

  const categories = await CategoryModel.find(query, {
    shopId: 0, // exclude shopId from the response
  }).lean();

  return categories;
}

export async function getCategoryById(shopId: string, categoryId: string) {
  const category = await CategoryModel.findOne(
    {
      _id: new mongoose.Types.ObjectId(categoryId),
      shopId: new mongoose.Types.ObjectId(shopId),
    },
    {
      shopId: 0, // exclude shopId from the response
    },
  ).lean();

  if (!category) {
    throw new Errors.NotFoundError(errMsg.CATEGORY_NOT_FOUND);
  }

  return category;
}
