import mongoose, { Schema, ObjectId, Types } from "mongoose";
import { collectionsName } from "../common/collections-name";

export interface IMenuItem {
  _id: Types.ObjectId;
  shopId: ObjectId;
  name: {
    en: string;
    ar: string;
  };
  description?: {
    en: string;
    ar: string;
  };
  price: number;
  categoryId: ObjectId;
  isAvailable: boolean;
  imgUrl?: string;
  imgDeleteUrl?: string;
  discountPercentage: number; // default 0
  options?: Array<{
    _id?: ObjectId; // Optional, for existing options
    name: {
      en: string;
      ar: string;
    };
    type: "single" | "multiple";
    required: boolean;
    choices: Array<{
      _id?: ObjectId; // Optional, for existing choices
      name: {
        en: string;
        ar: string;
      };
      price: number;
    }>;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const MenuItemSchema = new Schema<IMenuItem>(
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
    price: { type: Number, required: true },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: collectionsName.CATEGORIES,
      required: true,
    },
    isAvailable: { type: Boolean, default: true },
    imgUrl: { type: String },
    imgDeleteUrl: { type: String },
    discountPercentage: { type: Number, min: 0, max: 100, default: 0 },
    options: [
      {
        name: {
          en: { type: String, required: true },
          ar: { type: String, required: true },
        },
        type: { type: String, enum: ["single", "multiple"], required: true },
        required: { type: Boolean, default: false },
        choices: [
          {
            name: {
              en: { type: String, required: true },
              ar: { type: String, required: true },
            },
            price: { type: Number, default: 0 },
          },
        ],
      },
    ],
  },
  {
    timestamps: true,
    collection: collectionsName.MENU_ITEMS,
  },
);

// Matches the app's actual hot query pattern: listing a shop's (available)
// menu items (menu-item.service.ts:getMenuItemsByShop).
MenuItemSchema.index({ shopId: 1, isAvailable: 1 });

export const MenuItemModel = mongoose.model<IMenuItem>(
  collectionsName.MENU_ITEMS,
  MenuItemSchema,
);
