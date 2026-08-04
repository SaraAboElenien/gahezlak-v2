import { ObjectId } from "mongodb";
import mongoose, { Schema } from "mongoose";
import { collectionsName } from "../common/collections-name";

export interface IAIMenuData {
  _id: ObjectId;
  menuItemId: ObjectId;
  shopId: ObjectId;
  ingredients: string[];
  allergens: string[];
  dietaryTags: string[];
  aiProcessed: boolean;
  lastAIUpdate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AIMenuDataSchema = new Schema<IAIMenuData>(
  {
    menuItemId: {
      type: Schema.Types.ObjectId,
      ref: collectionsName.MENU_ITEMS,
      required: true,
      unique: true, // One AI data entry per menu item
    },
    shopId: {
      type: Schema.Types.ObjectId,
      ref: collectionsName.SHOPS,
      required: true,
    },
    ingredients: [
      {
        type: String,
        lowercase: true,
        trim: true,
      },
    ],
    allergens: [
      {
        type: String,
        lowercase: true,
        trim: true,
        enum: [
          "nuts",
          "peanuts",
          "tree nuts",
          "dairy",
          "milk",
          "eggs",
          "fish",
          "shellfish",
          "soy",
          "wheat",
          "gluten",
          "sesame",
          "mustard",
          "celery",
          "lupin",
          "molluscs",
          "sulphites",
        ],
      },
    ],
    dietaryTags: [
      {
        type: String,
        lowercase: true,
        trim: true,
        enum: [
          "vegan",
          "vegetarian",
          "halal",
          "kosher",
          "gluten-free",
          "dairy-free",
          "nut-free",
          "keto",
          "low-carb",
          "high-protein",
          "low-sodium",
          "sugar-free",
          "organic",
          "raw",
        ],
      },
    ],
    aiProcessed: {
      type: Boolean,
      default: false,
    },
    lastAIUpdate: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: collectionsName.AI_MENU_DATA,
  },
);

// Indexes for performance
AIMenuDataSchema.index({ shopId: 1 });
AIMenuDataSchema.index({ allergens: 1 });
AIMenuDataSchema.index({ dietaryTags: 1 });
AIMenuDataSchema.index({ ingredients: 1 });

export const AIMenuDataModel = mongoose.model<IAIMenuData>(
  collectionsName.AI_MENU_DATA,
  AIMenuDataSchema,
);
