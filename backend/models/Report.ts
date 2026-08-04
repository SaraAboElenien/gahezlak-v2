import mongoose, { Schema } from "mongoose";
import { ObjectId } from "mongodb";
import { collectionsName } from "../common/collections-name";
import { Role } from "./Role";

export interface IReport {
  senderFirstName?: string;
  senderLastName?: string;
  receiver: Role;
  message: string;
  shopId?: ObjectId; //  if receiver is shop
  orderNumber?: number;
  phoneNumber: number;
  shopName?: string; // if receiver is admin
}

const ReportSchema = new Schema<IReport>(
  {
    senderFirstName: { type: String },
    senderLastName: { type: String },
    shopId: {
      type: Schema.Types.ObjectId,
      ref: collectionsName.SHOPS,
      required: false,
    },
    receiver: { type: String, enum: Object.values(Role), required: true },
    message: { type: String, required: true },
    orderNumber: { type: Number },
    phoneNumber: { type: Number, required: true },
    shopName: { type: String },
  },
  {
    timestamps: true,
    collection: collectionsName.REPORT,
  },
);
export const Report = mongoose.model<IReport>(
  collectionsName.REPORT,
  ReportSchema,
);
