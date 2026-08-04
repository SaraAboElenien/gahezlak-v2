import { RequestHandler } from "express";
import * as ShopService from "../services/shop.service";
import {
  CreateOrder,
  UpdateOrderStatus,
  GetOrdersByShop,
  GetOrderById,
  // sendOrderToKitchen,
  // GetOrdersByStatus,
  getOrderDetailsByNumber,
} from "../services/order.service";
import {
  SuccessResponse,
  PaginatedResponse,
} from "../common/types/controller-response.types";

// import { getKitchenOrders } from "../services/order.service";
import { Errors } from "../errors";
import { errMsg } from "../common/err-messages";
import { IOrder, OrderStatus } from "../models/Order";
import { generateOrderNumber } from "../utils/generate-order-number";
import mongoose, { FilterQuery } from "mongoose";
import { createPaymentIntent, refundTransaction } from "../utils/paymob";
import { PaymentMethods } from "../models/Payment";
import { logger } from "../config/pino";
import { requireUser } from "../utils/current-user";
import { assertShopHasActiveSubscription } from "../middlewares/subscription-check.middleware";
import { Orders } from "../models/Order";
//import { io } from "../sockets/socketServer";

export const createOrderHandler: RequestHandler<
  unknown,
  SuccessResponse<{
    iframeUrl: string;
    orderNumber: number;
  }>,
  Pick<
    IOrder,
    | "tableNumber"
    | "paymentMethod"
    | "orderItems"
    | "customerFirstName"
    | "customerLastName"
    | "customerPhoneNumber"
  > & {
    shopName: string;
  }
> = async (req, res) => {
  const { shopName, ...orderData } = req.body;
  const shop = await ShopService.getShop({ shopName });
  if (!shop) {
    throw new Errors.NotFoundError(errMsg.SHOP_NOT_FOUND);
  }

  // Reject with a customer-facing message rather than the shop-owner-oriented
  // ones assertShopHasActiveSubscription throws (e.g. "no subscription found
  // for user") — a customer placing an order doesn't need or want to know
  // *why* the shop can't take orders right now, just that it can't.
  try {
    await assertShopHasActiveSubscription(shop._id);
  } catch {
    throw new Errors.NotAllowedError(
      errMsg.SHOP_NOT_ACCEPTING_ORDERS,
      req.lang,
    );
  }

  // The order-number counter increment and the order document itself must
  // succeed or fail together — a session/transaction prevents a counter
  // value being consumed with no corresponding order (or vice versa).
  const session = await mongoose.startSession();
  let newOrder;
  try {
    await session.withTransaction(async () => {
      const orderNumber = await generateOrderNumber(
        shop._id.toString(),
        session,
      );
      newOrder = await CreateOrder(
        {
          ...orderData,
          shopId: shop._id,
          orderNumber,
        },
        session,
      );
    });
  } finally {
    await session.endSession();
  }

  // Cash is settled in person, so there is nothing for Paymob to process:
  // no intention is created and the customer is never sent to checkout. The
  // frontend already behaved this way (it ignores iframeUrl for cash and goes
  // straight to the confirmation page); we used to create an intention anyway
  // that could never be completed. Paymob's own "Cash Collection" product is
  // a different thing — pay-at-an-outlet — and they confirmed (2026-08-05) it
  // isn't supported on Unified Checkout, which is the only checkout we use.
  const isPaidOffline = orderData.paymentMethod === PaymentMethods.Cash;

  let iframeUrl = "";
  try {
    if (!isPaidOffline) {
      ({ iframeUrl } = await createPaymentIntent({
        order: newOrder!,
        shopName,
        customer: {
          first_name: orderData.customerFirstName,
          last_name: orderData.customerLastName,
          phone_number: orderData.customerPhoneNumber,
        },
      }));
    }
  } catch (err) {
    // The order was already committed above but payment was never
    // initiated for it — remove it rather than leaving a ghost order that
    // occupies an order number and shows up in the shop's order list with
    // no way to ever be paid.
    await Orders.findByIdAndDelete(newOrder!._id);
    throw err;
  }

  res.status(201).json({
    message: "Order created successfully",
    data: {
      orderNumber: newOrder!.orderNumber,
      iframeUrl,
    },
  });
};

export const updateOrderStatusHandler: RequestHandler = async (req, res) => {
  const { shopId } = requireUser(req);
  const { orderId } = req.params;
  const { status } = req.body;

  const order = await GetOrderById(orderId, shopId);
  const updatedOrderStatus = await UpdateOrderStatus(shopId, orderId, status);

  if (status === OrderStatus.Cancelled && order.paymobTransactionId) {
    // Only orders that were actually paid through Paymob have a transaction
    // to refund. This used to call the void endpoint unconditionally with
    // `order.paymobTransactionId || ""` — so cancelling a cash order, or any
    // order whose payment never completed, sent an empty transaction id to
    // Paymob and failed the whole request *after* the status had already been
    // written. Refund (not void) is the right call here: by the time a shop
    // cancels, Paymob has normally settled the transaction, and void only
    // works before capture.
    //
    // A refund failure must not roll back or fail the cancellation — the
    // order genuinely is cancelled — so it is logged for manual follow-up
    // instead. Paymob's dashboard remains the source of truth for money
    // movement; see KNOWN_ISSUES.md.
    try {
      await refundTransaction(
        order.paymobTransactionId,
        Math.round(order.totalAmount * 100),
      );
    } catch (err) {
      logger.error(
        { err, orderId, transactionId: order.paymobTransactionId },
        "Order cancelled but the Paymob refund failed — refund this transaction manually.",
      );
    }
  }

  const response: SuccessResponse<typeof updatedOrderStatus> = {
    message: "Order status updated successfully",
    data: updatedOrderStatus,
  };

  res.status(200).json(response);
};

export const getOrdersByShopHandler: RequestHandler<
  unknown,
  PaginatedResponse<IOrder>,
  unknown,
  { page?: string; limit?: string }
> = async (req, res) => {
  const { shopId } = requireUser(req);
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  const query: FilterQuery<IOrder> = {};

  // if (req.user?.role === Role.KITCHEN) {
  //   query.orderStatus = { $in: [OrderStatus.Pending, OrderStatus.Confirmed] };
  // }

  const { orders, totalCount } = await GetOrdersByShop({
    shopId,
    query,
    skip,
    limit,
  });

  const totalPages = Math.ceil(totalCount / limit);

  res.status(200).json({
    message: "Orders retrieved successfully",
    data: orders,
    total: totalCount,
    page,
    totalPages,
  });
};

export const getOrderByIdHandler: RequestHandler = async (req, res) => {
  const orderId = req.params.orderId;
  const { shopId } = requireUser(req);
  const order = await GetOrderById(orderId, shopId);

  const response: SuccessResponse<typeof order> = {
    message: "Order retrieved successfully",
    data: order,
  };

  res.status(200).json(response);
};

export const getOrderDetailsByNumberHandler: RequestHandler<
  {
    orderNumber: string;
  },
  SuccessResponse<
    Pick<
      IOrder,
      | "orderNumber"
      | "orderStatus"
      | "totalAmount"
      | "createdAt"
      | "tableNumber"
    >
  >,
  unknown
> = async (req, res) => {
  const { orderNumber } = req.params;
  const order = await getOrderDetailsByNumber(Number(orderNumber));

  res.status(200).json({
    message: "Order details retrieved successfully",
    data: {
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      totalAmount: order.totalAmount,
      tableNumber: order.tableNumber,
      createdAt: order.createdAt,
    },
  });
};
