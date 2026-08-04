import mongoose, { Schema, Types } from "mongoose";
import { collectionsName } from "../common/collections-name";

export interface IPlan {
  _id: Types.ObjectId;
  planGroup: string; // e.g. "Pro", "Starter" — groups monthly/yearly together
  title: string;
  description: string;
  frequency: "monthly" | "yearly";
  currency: "EGP" | "USD";
  price: number;
  paymobPlanId: number;
  features: string[];
  trialPeriodDays: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const planSchema = new Schema<IPlan>(
  {
    planGroup: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    frequency: { type: String, required: true },
    currency: { type: String, required: true },
    price: { type: Number, required: true },
    paymobPlanId: { type: Number, required: true },
    features: { type: [String], required: true },
    trialPeriodDays: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
  },

  {
    timestamps: true,
    collection: collectionsName.PLANS,
  },
);

export const Plans = mongoose.model<IPlan>(collectionsName.PLANS, planSchema);
