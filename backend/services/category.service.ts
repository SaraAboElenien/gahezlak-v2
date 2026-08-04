import { ICategory, CategoryModel } from "../models/Category";
import { MenuItemModel } from "../models/MenuItem";
import { Errors } from "../errors";
import { errMsg } from "../common/err-messages";
import mongoose, { FilterQuery } from "mongoose";
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
    updateData,
    { new: true },
  ).lean();

  if (!category) {
    throw new Errors.NotFoundError(errMsg.CATEGORY_NOT_FOUND);
  }

  return category;
}

export async function deleteCategory(shopId: string, categoryId: string) {
  const category = await CategoryModel.findOneAndDelete({
    _id: new mongoose.Types.ObjectId(categoryId),
    shopId,
  });

  if (!category) {
    throw new Errors.NotFoundError(errMsg.CATEGORY_NOT_FOUND);
  }

  await MenuItemModel.updateMany(
    { category: categoryId },
    { category: null, isAvailable: false },
  );

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
