import mongoose, { Schema, Types } from "mongoose";
import { collectionsName } from "../common/collections-name";

export enum Role {
  ADMIN = "admin",
  USER = "user", // Will be used for any registered user
  SHOP_OWNER = "shop_owner",
  SHOP_MANAGER = "shop_manager",
  SHOP_STAFF = "shop_staff",
  KITCHEN = "kitchen",
}

export interface IRole {
  _id: Types.ObjectId;
  name: Role;
  permissions?: string[];
}

const RoleSchema = new Schema<IRole>({
  name: { type: String, required: true, enum: Role },
  permissions: { type: [String], default: [] },
});

export const Roles = mongoose.model<IRole>(collectionsName.ROLES, RoleSchema);
