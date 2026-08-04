import mongoose, { Schema, model, ObjectId } from "mongoose";
import { collectionsName } from "../common/collections-name";
import { IShop } from "./Shop";
import { IRole } from "./Role";

export interface IUser {
  _id: ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phoneNumber: string;
  createdAt: Date;
  updatedAt: Date;
  verificationCode: {
    code: string | null;
    expireAt: Date | null;
    reason: string | null;
  };
  isVerified: boolean;
  newEmail?: string | null;
  role: mongoose.Types.ObjectId | IRole;
  refreshToken: string;
  shop: mongoose.Types.ObjectId | IShop;
}

const UserSchema = new Schema<IUser>(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true, select: false },
    phoneNumber: { type: String, required: true },
    verificationCode: {
      code: { type: String, default: null },
      expireAt: { type: Date, default: null },
      reason: { type: String, default: null },
    },
    isVerified: { type: Boolean, default: false },
    newEmail: { type: String, default: null },
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: collectionsName.ROLES,
      required: true,
    },
    refreshToken: { type: String, default: "" },
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: collectionsName.SHOPS,
    },
  },
  {
    timestamps: true,
    collection: collectionsName.USERS,
  },
);

export const Users = model<IUser>(collectionsName.USERS, UserSchema);
