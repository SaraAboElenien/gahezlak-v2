import mongoose, { Schema, Document } from "mongoose";
import { collectionsName } from "../common/collections-name";
import { IShop } from "./Shop";

export interface ICategory extends Document {
  _id: mongoose.Types.ObjectId;
  shopId: mongoose.Types.ObjectId | IShop;
  name: {
    en: string;
    ar: string;
  };
  description?: {
    en: string;
    ar: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const CategorySchema = new Schema<ICategory>(
  {
    shopId: {
      type: Schema.Types.ObjectId,
      ref: collectionsName.SHOPS,
      required: true,
    },
    name: {
      en: { type: String, required: true },
      ar: { type: String, required: true },
    },
    description: {
      en: { type: String },
      ar: { type: String },
    },
  },
  {
    timestamps: true,
    collection: collectionsName.CATEGORIES,
  },
);

export const CategoryModel = mongoose.model<ICategory>(
  collectionsName.CATEGORIES,
  CategorySchema,
);
