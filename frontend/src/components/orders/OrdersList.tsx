import type { Order } from "@/types/order";
import { motion } from "framer-motion";
import { ChefHat, CheckCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

type Props = {
  orders: Order[];
  loadingOrderId: string | null;
  handleUpdateOrder: (orderId: string, newStatus: string) => void;
  handleViewDetails: (order: Order) => void;
  openUpdateModal: (order: Order) => void;
  getStatusColor: (status: string) => string;
  getStatusText: (status: string) => string;
  userRole: string;
};

const Role = {
  ADMIN: "admin",
  USER: "user",
  SHOP_OWNER: "shop_owner",
  SHOP_MANAGER: "shop_manager",
  SHOP_STAFF: "shop_staff",
  KITCHEN: "kitchen",
} as const;

export default function OrderList({
  userRole,
  orders,
  loadingOrderId,
  handleUpdateOrder,
  handleViewDetails,
  openUpdateModal,
  getStatusColor,
  getStatusText,
}: Props) {
  const { t } = useTranslation();
  console.log("userRole:", userRole);

  return (
    <>
      {orders.map((order, index) => (
        <motion.div
          key={order._id}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: index * 0.1 }}
          className={`rounded-lg p-4 transition-colors drop-shadow ${
            order.orderStatus === "Cancelled"
              ? "bg-red-50 hover:bg-red-100 opacity-75"
              : order.orderStatus === "Delivered"
                ? "bg-green-50 hover:bg-green-100 opacity-90"
                : order.orderStatus === "Pending"
                  ? "bg-yellow-50 hover:bg-yellow-100"
                  : order.orderStatus === "Preparing"
                    ? "bg-orange-50 hover:bg-orange-100"
                    : order.orderStatus === "Ready"
                      ? "bg-blue-50 hover:bg-blue-100"
                      : order.orderStatus === "Confirmed"
                        ? "bg-blue-50 hover:bg-blue-100"
                        : "bg-base-50 hover:bg-base-300"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div>
                <span className="font-semibold text-base-content">
                  {t("orderNumber")}: {order.orderNumber}
                </span>
                <span className="text-sm text-base-content/70 ml-2">
                  {order.tableNumber && (
                    <div>
                      {" "}
                      <span> {t("tableOrLocation")} : </span>{" "}
                      <span> {order.tableNumber} </span>{" "}
                    </div>
                  )}
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold text-primary">
                {order.totalAmount.toFixed(2)} EGP
              </p>
              <p className="text-sm text-base-content/70">
                {new Date(order.createdAt).toLocaleTimeString()}
              </p>
            </div>
          </div>

          <div className="mb-3">
            <p className="text-sm text-base-content/70 mb-1">
              {t("customer")}: {order.customerFirstName}{" "}
              {order.customerLastName}
            </p>
            <p className="text-sm text-base-content/70 mb-1">
              {t("phone")}: {order.customerPhoneNumber}
            </p>
            <p className="text-sm font-semibold text-base-content/70">
              {t("paymentMethod")} : {order.paymentMethod}
            </p>
          </div>

          <div className="flex justify-between items-center">
            <span
              className={`badge ${getStatusColor(
                order.orderStatus,
              )} px-3 py-1 rounded-2xl`}
            >
              {getStatusText(order.orderStatus)}
            </span>

            <div className="flex flex-wrap gap-2">
              {/* Pending ➜ Confirmed */}
              {order.orderStatus === "Pending" &&
                (userRole === Role.SHOP_STAFF || userRole !== Role.KITCHEN) && (
                  <button
                    onClick={() => handleUpdateOrder(order._id, "Confirmed")}
                    className="btn btn-sm rounded-3xl bg-success text-white font-medium border-0 hover:bg-green-400 shadow transition-all duration-300 transform"
                  >
                    {loadingOrderId === order._id ? (
                      <>
                        <span className="loading loading-spinner loading-sm"></span>
                        {t("confirming")}
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        {t("confirm")}
                      </>
                    )}
                  </button>
                )}

              {/* Confirmed ➜ Preparing */}
              {order.orderStatus === "Confirmed" &&
                (userRole === Role.KITCHEN || userRole !== Role.SHOP_STAFF) && (
                  <button
                    onClick={() => handleUpdateOrder(order._id, "Preparing")}
                    className="btn btn-sm rounded-3xl bg-orange-600 text-white font-medium border-0 hover:bg-orange-500 shadow transition-all duration-300 transform"
                  >
                    {loadingOrderId === order._id ? (
                      <>
                        <span className="loading loading-spinner loading-sm"></span>
                        {t("starting")}
                      </>
                    ) : (
                      <>
                        <ChefHat className="w-4 h-4" />
                        {t("startPreparing")}
                      </>
                    )}
                  </button>
                )}

              {/* Preparing ➜ Ready */}
              {order.orderStatus === "Preparing" &&
                (userRole === Role.KITCHEN || userRole !== Role.SHOP_STAFF) && (
                  <button
                    onClick={() => handleUpdateOrder(order._id, "Ready")}
                    className="btn btn-sm rounded-3xl bg-green-600 text-white font-medium border-0 outline-0 hover:bg-green-500 shadow transition-all duration-300 transform"
                  >
                    {loadingOrderId === order._id ? (
                      <>
                        <span className="loading loading-spinner loading-sm"></span>
                        {t("marking")}
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        {t("markAsReady")}
                      </>
                    )}
                  </button>
                )}

              {/* Ready to Delivered */}
              {order.orderStatus === "Ready" &&
                (userRole === Role.SHOP_STAFF || userRole !== Role.KITCHEN) && (
                  <button
                    onClick={() => handleUpdateOrder(order._id, "Delivered")}
                    className="btn btn-sm rounded-3xl bg-blue-600 text-white font-medium border-0 hover:bg-blue-500 shadow transition-all duration-300 transform"
                  >
                    {loadingOrderId === order._id ? (
                      <>
                        <span className="loading loading-spinner loading-sm"></span>
                        {t("completing")}
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        {t("completeOrder")}
                      </>
                    )}
                  </button>
                )}

              {/* Cancel Button for Pending (available only to shop_staff or others) */}
              {order.orderStatus === "Pending" &&
                (userRole === Role.SHOP_STAFF || userRole !== Role.KITCHEN) && (
                  <button
                    onClick={() => handleUpdateOrder(order._id, "Cancelled")}
                    className="btn btn-sm rounded-3xl bg-red-600 text-white font-medium border-0 hover:bg-red-500 shadow transition-all duration-300 transform"
                  >
                    {loadingOrderId === order._id ? (
                      <>
                        <span className="loading loading-spinner loading-sm"></span>
                        {t("cancelling")}
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        {t("cancelOrder")}
                      </>
                    )}
                  </button>
                )}

              {/* Update Status Button - shown if not delivered/cancelled */}
              {order.orderStatus !== "Delivered" &&
                order.orderStatus !== "Cancelled" &&
                userRole !== Role.KITCHEN &&
                userRole !== Role.SHOP_STAFF && (
                  <button
                    className="btn btn-sm rounded-3xl bg-blue-600 border-0 text-white font-medium shadow transition-all duration-300 transform hover:bg-blue-500"
                    onClick={() => openUpdateModal(order)}
                  >
                    {t("updateStatus")}
                  </button>
                )}

              {/* View Details - always shown */}
              <button
                className="btn btn-sm bg-orange-500 hover:bg-orange-400 text-white py-3 border-0 rounded-3xl font-medium shadow transition-all duration-300 transform"
                onClick={() => handleViewDetails(order)}
              >
                {t("viewDetails")}
              </button>
            </div>
          </div>
        </motion.div>
      ))}
    </>
  );
}
