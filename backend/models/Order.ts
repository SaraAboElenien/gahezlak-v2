import mongoose, { Schema, Types } from "mongoose";
import { collectionsName } from "../common/collections-name";
import { PaymentMethods } from "./Payment";
import { IMenuItem } from "./MenuItem";

export interface IOrderItem {
  menuItem: IMenuItem | Types.ObjectId;
  quantity: number;
  customizationDetails: string;
  selectedOptions?: Array<{
    optionId: Types.ObjectId; // or index
    choiceIds: Types.ObjectId[]; // or indices, for multiple choices
  }>;
  discountPercentage: number;
  price: number;
}

export enum OrderStatus {
  Pending = "Pending",
  Confirmed = "Confirmed",
  Preparing = "Preparing",
  Ready = "Ready",
  Delivered = "Delivered",
  Cancelled = "Cancelled",
}

export interface IOrder {
  _id: Types.ObjectId;
  shopId: Types.ObjectId;
  tableNumber?: number; // Optional field for dine-in orders
  orderStatus: OrderStatus;
  totalAmount: number;
  orderItems: IOrderItem[];
  orderNumber: number;
  customerFirstName: string;
  customerLastName: string;
  customerPhoneNumber: string;
  paymentMethod: PaymentMethods;
  paymobTransactionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OrderSchema = new Schema<IOrder>(
  {
    shopId: {
      type: Schema.Types.ObjectId,
      ref: collectionsName.SHOPS,
      required: true,
    },
    orderNumber: { type: Number, required: true, unique: true },
    customerFirstName: { type: String, required: true },
    customerLastName: { type: String, required: true },
    customerPhoneNumber: { type: String, required: true },
    paymentMethod: {
      type: String,
      enum: PaymentMethods,
    },
    paymobTransactionId: { type: String },
    tableNumber: { type: Number },
    orderStatus: {
      type: String,
      enum: Object.values(OrderStatus),
      required: true,
      default: OrderStatus.Pending,
    },
    totalAmount: { type: Number, required: true },
    orderItems: [
      {
        menuItem: {
          type: Schema.Types.ObjectId,
          ref: collectionsName.MENU_ITEMS,
          required: true,
        },
        quantity: { type: Number, required: true },
        selectedOptions: [
          {
            optionId: { type: Schema.Types.ObjectId },
            choiceIds: [{ type: Schema.Types.ObjectId }],
          },
        ],

        customizationDetails: { type: String },
        discountPercentage: { type: Number, default: 0, min: 0, max: 100 },
        price: { type: Number, required: true },
      },
    ],
  },
  {
    timestamps: true,
    collection: collectionsName.ORDERS,
  },
);

// Matches the app's actual hot query patterns: listing a shop's orders
// newest-first (order.service.ts:GetOrdersByShop) and filtering a shop's
// orders by status (order.service.ts:GetOrdersByStatus).
OrderSchema.index({ shopId: 1, createdAt: -1 });
OrderSchema.index({ shopId: 1, orderStatus: 1 });

export const Orders = mongoose.model<IOrder>(
  collectionsName.ORDERS,
  OrderSchema,
);
