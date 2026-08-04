import mongoose, { Schema, Types } from "mongoose";
import { collectionsName } from "../common/collections-name";

export interface IShopMember {
  userId: Types.ObjectId;
  roleId: Types.ObjectId;
}

export interface IShop {
  _id: Types.ObjectId;
  name: string;
  type: string;
  address: {
    country: string;
    city: string;
    street: string;
  };
  phoneNumber: string;
  email: string;
  ownerId: Types.ObjectId;
  members: IShopMember[];
  isPaymentDone: boolean;
  qrCodeUrl?: string; // imgbb QR code image URL
  logoUrl?: string; // imgbb restaurant logo image URL
  subscriptionId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const ShopSchema = new Schema<IShop>(
  {
    name: { type: String, required: true, unique: true },
    type: { type: String, required: true },
    address: {
      country: { type: String, required: true },
      city: { type: String, required: true },
      street: { type: String, required: true },
    },
    phoneNumber: { type: String, required: true },
    email: { type: String, required: true },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: collectionsName.USERS,
      required: true,
    },
    subscriptionId: {
      type: Schema.Types.ObjectId,
      ref: collectionsName.SUBSCRIPTIONS,
      default: null,
    },
    qrCodeUrl: { type: String }, // imgbb QR code image URL
    logoUrl: { type: String }, // imgbb restaurant logo image URL   logoDeleteUrl: { type: String }, // imgbb delete url for logo
    members: {
      type: [
        {
          _id: false,
          userId: {
            type: Schema.Types.ObjectId,
            ref: collectionsName.USERS,
            required: true,
          },
          roleId: {
            type: Schema.Types.ObjectId,
            ref: collectionsName.ROLES,
            required: true,
          },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: collectionsName.SHOPS,
    versionKey: false,
  },
);

export const Shops = mongoose.model<IShop>(collectionsName.SHOPS, ShopSchema);
