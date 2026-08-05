import { Orders, IOrder, OrderStatus } from "../models/Order";
import { Errors } from "../errors";
import { errMsg } from "../common/err-messages";
import mongoose, { FilterQuery } from "mongoose";
import { IMenuItem, MenuItemModel } from "../models/MenuItem";
import {
  calculateOrderTotalAmount,
  calculateItemPrice,
} from "../utils/order-calculations";

export async function CreateOrder(
  orderData: Pick<
    IOrder,
    | "tableNumber"
    | "paymentMethod"
    | "orderItems"
    | "customerFirstName"
    | "customerLastName"
    | "customerPhoneNumber"
    | "shopId"
    | "orderNumber"
  >,
  session?: mongoose.ClientSession,
) {
  const uniqueMenuItemIds = [
    ...new Set(orderData.orderItems?.map((item) => item.menuItem.toString())),
  ];
  const menuItems = await MenuItemModel.find({
    _id: { $in: uniqueMenuItemIds },
    isAvailable: true,
    shopId: orderData.shopId,
  }).session(session ?? null);

  if (menuItems.length !== uniqueMenuItemIds.length) {
    throw new Errors.BadRequestError(errMsg.MENU_ITEM_NOT_FOUND);
  }

  const menuItemMap = new Map<string, IMenuItem>();
  menuItems.forEach((item) => {
    menuItemMap.set(item._id.toString(), item);
  });

  for (const orderItem of orderData.orderItems) {
    const menuItem = menuItemMap.get(orderItem.menuItem.toString());
    if (!menuItem) continue;

    const { finalPrice, validatedOptions } = calculateItemPrice(
      menuItem,
      orderItem.selectedOptions || [],
    );

    orderItem.price = finalPrice;
    orderItem.discountPercentage = menuItem.discountPercentage;
    orderItem.selectedOptions = validatedOptions;
  }

  const totalAmount = calculateOrderTotalAmount(orderData.orderItems);

  const [newOrder] = await Orders.create(
    [
      {
        ...orderData,
        totalAmount,
      },
    ],
    { session },
  );
  await newOrder.populate({
    path: "orderItems.menuItem",
    options: { session },
  });

  return newOrder.toObject();
}

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.Pending]: [OrderStatus.Confirmed, OrderStatus.Cancelled],
  [OrderStatus.Confirmed]: [OrderStatus.Preparing, OrderStatus.Cancelled],
  [OrderStatus.Preparing]: [OrderStatus.Ready],
  [OrderStatus.Ready]: [OrderStatus.Delivered],
  [OrderStatus.Delivered]: [],
  [OrderStatus.Cancelled]: [],
};

export async function UpdateOrderStatus(
  shopId: string,
  orderId: string,
  status: OrderStatus,
) {
  const order = await Orders.findOne({
    _id: orderId,
    shopId: new mongoose.Types.ObjectId(shopId),
  });

  if (!order) {
    throw new Errors.NotFoundError(errMsg.ORDER_NOT_FOUND);
  }

  const currentStatus = order.orderStatus;
  const allowedTransitions = STATUS_TRANSITIONS[currentStatus];

  if (!allowedTransitions.includes(status)) {
    throw new Errors.BadRequestError({
      en: `Cannot transition from ${currentStatus} to ${status}`,
      ar: `لا يمكن الانتقال من ${currentStatus} إلى ${status}`,
    });
  }

  order.orderStatus = status;
  await order.save();
  return order.toObject();
}

export async function GetOrdersByShop({
  shopId,
  query,
  skip,
  limit,
}: {
  shopId: string;
  query: FilterQuery<IOrder>;
  skip: number;
  limit: number;
}) {
  // `query` must reach both calls, or a filtered request returns every row
  // while totalCount reports the filtered figure. `shopId` is spread last in
  // both so a caller-supplied filter can never widen the scope past its own
  // shop.
  const filter = { ...query, shopId };

  const orders = await Orders.find(filter, {
    shopId: 0,
  })
    .populate({
      path: "orderItems.menuItem",
      select: "name price options imgUrl discountPercentage",
    })
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 })
    .lean();
  const totalCount = await Orders.countDocuments(filter);

  return { orders, totalCount };
}

export async function GetOrderById(orderId: string, shopId: string) {
  const order = await Orders.findOne({
    _id: orderId,
    shopId: new mongoose.Types.ObjectId(shopId),
  });

  if (!order) {
    throw new Errors.NotFoundError(errMsg.ORDER_NOT_FOUND);
  }

  return order.toObject();
}

export async function GetOrdersByStatus(status: string, shopId: string) {
  const orders = await Orders.find({ orderStatus: status, shopId });
  const totalCount = await Orders.countDocuments({
    orderStatus: status,
    shopId,
  });
  return { orders: orders.map((order) => order.toObject()), totalCount };
}

export async function getKitchenOrders(shopId: string) {
  const orders = await Orders.find({
    shopId: new mongoose.Types.ObjectId(shopId),
    orderStatus: OrderStatus.Preparing,
  }).populate("orderItems.menuItemId");

  return orders.map((order) => order.toObject());
}

export async function getOrderDetailsByNumber(orderNumber: number) {
  const order = await Orders.findOne({ orderNumber }).lean();
  if (!order) {
    throw new Errors.NotFoundError(errMsg.ORDER_NOT_FOUND);
  }
  return order;
}
