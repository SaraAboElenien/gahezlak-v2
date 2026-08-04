import { Report } from "../models/Report";
import { Role } from "../models/Role";
import mongoose from "mongoose";
import { Errors } from "../errors";
import { Shops } from "../models/Shop";
import { IReport } from "../models/Report";
import { errMsg } from "../common/err-messages";
import { Orders } from "../models/Order";
export async function createShopReport(
  shopName: string,
  reportData: Pick<
    IReport,
    | "orderNumber"
    | "senderFirstName"
    | "senderLastName"
    | "message"
    | "phoneNumber"
  >,
) {
  const shop = await Shops.findOne({ name: shopName }).lean();
  if (!shop) throw new Errors.NotFoundError(errMsg.SHOP_NOT_FOUND);

  const order = await Orders.findOne({
    orderNumber: reportData.orderNumber,
    shopId: shop._id,
    customerPhoneNumber: reportData.phoneNumber,
    customerFirstName: reportData.senderFirstName,
    customerLastName: reportData.senderLastName,
  }).lean();
  if (!order) throw new Errors.NotFoundError(errMsg.ORDER_NOT_FOUND);

  const shopReport: IReport = {
    ...reportData,
    shopId: shop._id,
    receiver: Role.SHOP_OWNER,
  };

  const report = await Report.create(shopReport);
  return report.toObject();
}

export async function createAdminReport(
  reportData: Pick<
    IReport,
    | "phoneNumber"
    | "senderFirstName"
    | "senderLastName"
    | "message"
    | "shopName"
  >,
) {
  const adminReport: IReport = {
    ...reportData,
    receiver: Role.ADMIN,
  };

  const report = await Report.create(adminReport);

  return report.toObject();
}

export const getAllAdminReports = async () => {
  const adminReports = await Report.find({ receiver: Role.ADMIN })
    .sort({ createdAt: -1 })
    .lean();
  return adminReports;
};

export const getAllShopReports = async (shopId: string) => {
  const shopReports = await Report.find({
    receiver: Role.SHOP_OWNER,
    shopId: new mongoose.Types.ObjectId(shopId),
  })
    .sort({ createdAt: -1 })
    .lean();
  return shopReports;
};
