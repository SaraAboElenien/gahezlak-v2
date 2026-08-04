import { Shops } from "../models/Shop";
import { CategoryModel } from "../models/Category";
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

  await CategoryModel.updateMany(
    { shopId, menuItems: itemId },
    { $pull: { menuItems: itemId } },
  );

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

export const updateMenuItem = async (
  shopId: string,
  itemId: string,
  updateData: Partial<IMenuItem>,
) => {
  const menuItem = await MenuItemModel.findOneAndUpdate(
    { _id: itemId, shopId },
    updateData,
    { new: true },
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
