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
  // Was `number` — see the schema field below for why.
  phoneNumber: string;
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
    // Was `Number` — Mongoose casts on write, so a submitted "01012345678"
    // (the Egyptian mobile format the frontend enforces, see
    // reviewFormSchema.ts) was silently persisted as 1012345678, losing the
    // leading zero that makes the number diallable. See TECH_DEBT.md's
    // "Report phone numbers are stored as numbers" entry and
    // utils/migrate-report-phone-numbers.ts for the fix-up of rows already
    // written under the old type.
    phoneNumber: { type: String, required: true },
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
