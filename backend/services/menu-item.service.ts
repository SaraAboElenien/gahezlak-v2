import { Shops } from "../models/Shop";
import { MenuItemModel, IMenuItem } from "../models/MenuItem";
import { Errors } from "../errors";
import { errMsg } from "../common/err-messages";
import { getCategoryById } from "./category.service";
import { LangType } from "../common/types/general-types";
import mongoose, { FilterQuery } from "mongoose";

export const createMenuItem = async (
  shopId: string,
  menuItemData: Pick<
    IMenuItem,
    | "name"
    | "description"
    | "price"
    | "categoryId"
    | "imgUrl"
    | "discountPercentage"
  >,
) => {
  await getCategoryById(shopId, menuItemData.categoryId.toString()); // make sure the category exists

  const menuItem = await MenuItemModel.create({
    ...menuItemData,
    shopId,
  });

  return menuItem.toObject();
};

// `_lang` is accepted (and passed by every caller) but not yet used: the
// localisation of menu-item documents is still unimplemented.
export const getMenuItemById = async (
  shopId: string,
  itemId: string,
  _lang: "en" | "ar",
) => {
  const menuItem = await MenuItemModel.findOne({ _id: itemId, shopId }).lean();
  if (!menuItem) throw new Errors.NotFoundError(errMsg.MENU_ITEM_NOT_FOUND);

  return menuItem;
};

export const deleteMenuItem = async (shopId: string, itemId: string) => {
  const menuItem = await MenuItemModel.findOneAndDelete({
    _id: itemId,
    shopId,
  }).lean();
  if (!menuItem) throw new Errors.NotFoundError(errMsg.MENU_ITEM_NOT_FOUND);

  // No back-reference to clean up. A category owns nothing: the relationship is
  // held entirely by `MenuItem.categoryId`, so deleting the item deletes the
  // link. This used to `$pull` the item out of a `Category.menuItems` array
  // that `models/Category.ts` has never declared — the filter matched no
  // document on any call, which is why nothing ever looked wrong. Removed
  // rather than "fixed", because inventing that array would give the
  // membership two sources of truth that could disagree.
  return menuItem;
};

export const toggleItemAvailability = async (
  shopId: string,
  itemId: string,
  isAvailable: boolean,
) => {
  const menuItem = await MenuItemModel.findOneAndUpdate(
    { _id: itemId, shopId },
    { isAvailable },
    { new: true },
  );
  if (!menuItem) throw new Errors.NotFoundError(errMsg.MENU_ITEM_NOT_FOUND);

  return menuItem.toObject();
};

/**
 * Fields a menu-item update is permitted to touch — mirrors
 * `validateUpdateMenuItem`.
 *
 * The allowlist is the security control. `shopId` is an IMenuItem field that
 * the validator does not name, and express-validator does not strip unlisted
 * keys, so spreading `req.body` into the update let a caller move an item into
 * a shop they do not own: the `{ _id, shopId }` filter matched using their own
 * shop, then wrote someone else's id into the document. The item left their
 * menu and appeared on the other shop's — priced by the original owner and
 * orderable by the other shop's customers. Same class as the order IDOR fixed
 * on 2026-07-30.
 */
const UPDATABLE_MENU_ITEM_FIELDS = [
  "name",
  "description",
  "price",
  "categoryId",
  "imgUrl",
  "discountPercentage",
  "options",
  "isAvailable",
] as const satisfies readonly (keyof IMenuItem)[];

function pickUpdatableMenuItemFields(
  updateData: Partial<IMenuItem>,
): Partial<IMenuItem> {
  const updates: Partial<IMenuItem> = {};
  for (const field of UPDATABLE_MENU_ITEM_FIELDS) {
    const value = updateData[field];
    if (value !== undefined) {
      // TypeScript cannot correlate the key with its value type while `field`
      // ranges over a union of keys, so it widens the target to `never`. The
      // assignment is sound — the same `field` indexes both objects.
      (updates as Record<string, unknown>)[field] = value;
    }
  }
  return updates;
}

export const updateMenuItem = async (
  shopId: string,
  itemId: string,
  updateData: Partial<IMenuItem>,
) => {
  const menuItem = await MenuItemModel.findOneAndUpdate(
    { _id: itemId, shopId },
    pickUpdatableMenuItemFields(updateData),
    // runValidators keeps the schema's `discountPercentage` 0-100 bound live on
    // updates. Without it the only thing enforcing that bound was the PATCH
    // route's express-validator rule, so any non-HTTP writer (a seed script, an
    // import, the AI menu extractor) could store a discount above 100 — which
    // makes the line price CreateOrder computes negative, subtracting from the
    // order total.
    { new: true, runValidators: true },
  );
  if (!menuItem) throw new Errors.NotFoundError(errMsg.MENU_ITEM_NOT_FOUND);

  return menuItem.toObject();
};

// `lang` is accepted (and passed by every caller) but not yet used — see above.
export async function getMenuItemsByShop({
  shopId,
  shopName,
  skip,
  limit,
}: {
  shopId?: string;
  shopName?: string;
  lang: LangType;
  // Pagination is opt-in: only applied when both are provided, so existing
  // callers that don't send page/limit keep getting the full, unpaginated
  // list they always have.
  skip?: number;
  limit?: number;
}) {
  if (!shopId && !shopName) {
    // With neither argument the filter below would collapse to `{}` and
    // return every tenant's menu items. "No selector" must mean "not found",
    // not "every shop" — same family as the order IDOR fixed 2026-07-30.
    // See TECH_DEBT.md.
    throw new Errors.BadRequestError(errMsg.SHOP_SELECTOR_REQUIRED);
  }

  const query: FilterQuery<IMenuItem> = {};

  if (shopId) {
    query.shopId = new mongoose.Types.ObjectId(shopId);
  }

  if (shopName) {
    const shop = await Shops.findOne({ name: shopName }).lean();
    if (!shop) {
      throw new Errors.NotFoundError(errMsg.SHOP_NOT_FOUND);
    }
    query.shopId = shop._id;
    query.isAvailable = true;
  }

  let itemsQuery = MenuItemModel.find(query, { shopId: 0 }).sort({
    createdAt: -1,
  });

  if (skip !== undefined && limit !== undefined) {
    itemsQuery = itemsQuery.skip(skip).limit(limit);
  }

  const items = await itemsQuery.lean();
  const totalCount = await MenuItemModel.countDocuments(query);

  return { items, totalCount };
}
