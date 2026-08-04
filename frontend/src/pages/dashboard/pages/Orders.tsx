import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, ListOrdered } from "lucide-react";
import { useOrdersByShop, useUpdateOrderStatus } from "@/hooks/useOrder";
import { useProfile } from "@/hooks/useProfile";
import type { Order } from "@/types/order";
import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import OrderList from "@/components/orders/OrdersList";
import OrderDetailsModal from "@/components/orders/OrderDetailsModal";
import UpdateStatusModal from "@/components/orders/UpdateStatusModal";
import { isToday } from "date-fns";
import { useLang } from "@/hooks/useLang";
import { useTranslation } from "react-i18next";
import Loader from "@/components/Loader";
import { ErrorComponent } from "@/components/ErrorComponent";
import { SkeletonCard } from "@/components/analytics/SkeletonLoaders";
import { AxiosError } from "axios";

export const Role = {
  ADMIN: "admin",
  USER: "user",
  SHOP_OWNER: "shop_owner",
  SHOP_MANAGER: "shop_manager",
  SHOP_STAFF: "shop_staff",
  KITCHEN: "kitchen",
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export default function Orders() {
  const queryClient = useQueryClient();
  const { currentLang } = useLang();
  const { t } = useTranslation();

  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [loadingOrderId, setLoadingOrderId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 10;

  const {
    user: userData,
    loading: isLoading,
    error,
    refreshProfile: refetch,
  } = useProfile();
  const { data: orders, isLoading: OrderLoading } = useOrdersByShop(
    currentPage,
    limit,
  );
  const { mutate: updateOrderStatus, isPending } = useUpdateOrderStatus();

  useEffect(() => {
    if (userData?.role?.name) {
      setUserRole(userData.role.name);
    }
  }, [userData]);

  useEffect(() => {
    if (orders?.page && orders?.totalPages) {
      setCurrentPage(orders.page);
      setTotalPages(orders.totalPages);
    }
  }, [orders]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentPage]);

  if (isLoading) return <Loader />;
  if (error) return <ErrorComponent error={error} onRetry={refetch} />;

  // Filter orders based on role and search term
  const getFilteredOrders = (
    ordersData: { data: Order[] },
    userRole: string,
  ) => {
    let filtered = [...(ordersData?.data || [])];

    // Role  filterings
    filtered = filtered.filter((order) => {
      // Kitchen: only orders NOT Pending AND NOT delivered
      if (userRole === Role.KITCHEN) {
        return (
          order.orderStatus !== "Pending" &&
          order.orderStatus !== "Delivered" &&
          order.orderStatus !== "Cancelled" &&
          order.orderStatus !== "Ready"
        );
      }
      // Other roles:
      return true;
    });

    // Search + status filtering
    return filtered.filter((order) => {
      const matchesSearch = order.orderNumber?.toString().includes(searchTerm);
      const matchesStatus =
        selectedStatus === "All" || order.orderStatus === selectedStatus;
      return matchesSearch && matchesStatus;
    });
  };

  // Filter Orders
  const filteredOrders = getFilteredOrders(orders, userRole || "");

  const handleViewDetails = (order: Order) => {
    setSelectedOrder(order);
    setShowDetailsModal(true);
  };

  const openUpdateModal = (order: Order) => {
    setSelectedOrder(order);
    setNewStatus(order.orderStatus);
    setShowUpdateModal(true);
  };

  const handleUpdateStatus = () => {
    if (!selectedOrder) return;

    const data = {
      orderId: selectedOrder._id,
      status: newStatus,
    };

    updateOrderStatus(data, {
      onSuccess: () => {
        toast.success("Status updated successfully");
        setShowUpdateModal(false);
        queryClient.invalidateQueries({ queryKey: ["orders"] });
      },
      onError: (err: unknown) => {
        console.log(err);
        const message =
          err instanceof AxiosError ? err.response?.data?.message : undefined;
        toast.error(message || "Failed to update status");
      },
    });
  };

  const handleUpdateOrder = async (orderId: string, status: string) => {
    setLoadingOrderId(orderId);
    const data = {
      orderId: orderId,
      status: status,
    };

    updateOrderStatus(data, {
      onSuccess: () => {
        toast.success("Status updated successfully");
        setLoadingOrderId(null);
        queryClient.invalidateQueries({ queryKey: ["orders"] });
      },
      onError: (err: unknown) => {
        setLoadingOrderId(null);
        const message =
          err instanceof AxiosError ? err.response?.data?.message : undefined;
        toast.error(message || "Failed to update status");
      },
    });
  };

  // stats
  const TodayStats = getTodayStats(orders);
  function getTodayStats(ordersData: { data: Order[] }) {
    const todayOrders = (ordersData?.data || []).filter((order: Order) =>
      isToday(new Date(order.createdAt)),
    );

    const totalOrders = todayOrders.length;

    const totalSales = todayOrders
      .filter(
        (order: Order) =>
          order.orderStatus !== "Pending" && order.orderStatus !== "Cancelled",
      )
      .reduce((sum: number, order: Order) => sum + order.totalAmount, 0);

    const pendingOrders = todayOrders.filter(
      (order: Order) => order.orderStatus === "Pending",
    ).length;

    const completedOrders = todayOrders.filter(
      (order: Order) => order.orderStatus === "Delivered",
    ).length;

    return {
      totalOrders,
      totalSales,
      pendingOrders,
      completedOrders,
    };
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Ready":
        return "bg-green-500";
      case "Preparing":
        return "bg-orange-500";
      case "Delivered":
        return "badge-info";
      case "Completed":
        return "badge-neutral";
      case "Pending":
        return "bg-yellow-400";
      case "Cancelled":
        return "bg-black text-white";
      case "Confirmed":
        return "bg-blue-500";
      default:
        return "badge-neutral";
    }
  };

  const statusOptions = [
    { value: "Pending", label: "Pending" },
    { value: "Confirmed", label: "Confirmed" },
    { value: "Preparing", label: "Preparing" },
    { value: "Ready", label: "Ready" },
    { value: "Delivered", label: "Delivered" },
    { value: "Cancelled", label: "Cancelled" },
  ];

  const getStatusText = (status: string) => {
    switch (status) {
      case "Ready":
        return "Ready";
      case "Preparing":
        return "Preparing";
      case "Delivered":
        return "Delivered";
      case "Completed":
        return "Completed";
      case "Cancelled":
        return "Cancelled";
      case "Pending":
        return "Pending";
      case "Confirmed":
        return "Confirmed";
      default:
        return "Unknown";
    }
  };

  return (
    <>
      <div className="card bg-base-100 pt-5 max-w-[80vw] mx-auto">
        {/* Hero Header */}
        <div className=" dark:bg-card shadow-sm border-b border-gray-200 dark:border-gray-700">
          <div className="px-10 py-8">
            <div className="flex flex-col lg:items-center lg:justify-between gap-6">
              {/* Title Section */}
              <div className="w-full flex items-center gap-4">
                <motion.div
                  className="w-16 h-16 bg-gradient-to-br from-primary to-darker-primary rounded-2xl flex items-center justify-center shadow-lg"
                  whileHover={{
                    scale: 1.1,
                    rotate: 180,
                    transition: { duration: 0.5 },
                  }}
                >
                  <ListOrdered className="w-8 h-8 text-white" />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{
                    opacity: 1,
                    x: 0,
                    transition: { duration: 0.5, delay: 0.4 },
                  }}
                >
                  <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
                    {t("orders")}
                  </h1>
                  <p className="text-lg text-gray-600 dark:text-gray-300">
                    {t("manageShopOrders")}
                  </p>
                </motion.div>
              </div>
              {OrderLoading ? (
                <SkeletonCard />
              ) : (
                <>
                  <div className="w-full grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="stat bg-green-50 shadow rounded-xl">
                      <div className="stat-title">{t("totalOrdersToday")}</div>
                      <div className="stat-value text-primary">
                        {TodayStats.totalOrders}
                      </div>
                    </div>
                    <div className="stat bg-green-50 shadow rounded-xl">
                      <div className="stat-title ">{t("totalSales")}</div>
                      <div className="stat-value text-success text-lg lg:text-xl">
                        EGP{TodayStats.totalSales?.toFixed(2)}
                      </div>
                    </div>
                    <div className="stat bg-green-50 shadow rounded-xl">
                      <div className="stat-title">{t("pendingOrders")}</div>
                      <div className="stat-value text-warning">
                        {TodayStats.pendingOrders}
                      </div>
                    </div>
                    <div className="stat bg-green-50 shadow rounded-xl">
                      <div className="stat-title">{t("completedOrders")}</div>
                      <div className="stat-value text-green-500">
                        {TodayStats.completedOrders}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <div
          className={`card-body pt-7 px-2 md:px-10 ${
            currentLang === "ar" ? "dir-rtl" : "dir-ltr"
          } `}
        >
          {/* Search Input */}
          <div className="flex justify-between items-center mb-4 gap-4">
            <div className="relative w-1/2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder={t("searchPlaceholder")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border w-full border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white text-gray-700"
              />
            </div>

            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="select select-bordered w-1/2 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white text-gray-700"
            >
              <option value="All">{t("allStatuses")}</option>
              <option value="Pending">{t("pending")}</option>
              <option value="Confirmed">{t("confirmed")}</option>
              <option value="Preparing">{t("preparing")}</option>
              <option value="Ready">{t("ready")}</option>
              <option value="Completed">{t("completed")}</option>
              <option value="Delivered">{t("delivered")}</option>
              <option value="Cancelled">{t("cancelled")}</option>
            </select>
          </div>

          {OrderLoading ? (
            <SkeletonCard />
          ) : (
            <>
              {/* Search Results Info */}
              {filteredOrders.length <= 0 && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg text-xl">
                  <p className="text-gray-700">{t("noOrdersFound")}</p>
                </div>
              )}

              {/* Orders List */}
              <div className="space-y-4">
                <OrderList
                  userRole={userRole || ""}
                  orders={filteredOrders}
                  loadingOrderId={loadingOrderId}
                  handleUpdateOrder={handleUpdateOrder}
                  handleViewDetails={handleViewDetails}
                  openUpdateModal={openUpdateModal}
                  getStatusColor={getStatusColor}
                  getStatusText={getStatusText}
                />
              </div>
            </>
          )}

          {/* Pagination Controls */}
          <div className="mt-6 flex justify-center gap-2">
            <button
              className="btn btn-outline btn-sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            >
              {t("previous")}
            </button>

            <span className="px-4 py-2 border rounded text-sm">
              {t("pageXofY", { current: currentPage, total: totalPages })}
            </span>

            <button
              className="btn btn-outline btn-sm"
              disabled={currentPage === totalPages}
              onClick={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages))
              }
            >
              {t("next")}
            </button>
          </div>
        </div>
      </div>

      {/* Order Details Modal */}
      <OrderDetailsModal
        selectedOrder={selectedOrder}
        show={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
      />

      {/* Update Status Modal */}
      <UpdateStatusModal
        show={showUpdateModal}
        onClose={() => setShowUpdateModal(false)}
        order={selectedOrder}
        newStatus={newStatus}
        setNewStatus={setNewStatus}
        onUpdateStatus={handleUpdateStatus}
        isPending={isPending}
        statusOptions={statusOptions}
      />
    </>
  );
}
