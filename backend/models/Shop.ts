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
  // Legacy only, as of 2026-08-24: the old imgbb-hosted QR flow wrote this;
  // nothing writes or reads it any more. The QR image is now generated on
  // demand from the shop's *current* name — see
  // `GET /shops/name/:shopName/qr-code.png` and `utils/qr-code-generator.ts`.
  //
  // RETAINED DELIBERATELY — do not delete. Shop documents created before that
  // change still carry the field in the production database. Dropping it from
  // the schema would not remove those values; it would only make them
  // invisible to Mongoose (strict mode hides undeclared paths from reads and
  // silently ignores them in writes), so they could no longer be inspected or
  // cleaned up through the model. It stays declared until a migration has
  // actually unset it on the old rows.
  qrCodeUrl?: string;
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
    qrCodeUrl: { type: String }, // legacy only — see the interface comment above
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
