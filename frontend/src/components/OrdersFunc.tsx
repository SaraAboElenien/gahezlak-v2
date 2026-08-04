import { useState } from "react";
import { User, CreditCard, ChefHat } from "lucide-react";
import {
  useOrdersByShop,
  useRoles,
  useUpdateOrderStatus,
} from "@/hooks/useOrder";
import { useProfile } from "@/hooks/useProfile";

interface Order {
  id: string;
  status: string;
  type: "dine-in" | "delivery" | "takeaway";
  // Add other order properties as needed
}

interface Role {
  name: string;
  permissions: string[];
}

const OrdersFunc = ({ role }: { role: string }) => {
  // User context
  const { user: userData } = useProfile();
  console.log("userData:", userData);

  // Component state
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // React Query hooks
  const {
    data: orders = [],
    isLoading,
    isError,
    refetch,
  } = useOrdersByShop(1, 10);
  const { data: roles = [] } = useRoles();
  const updateOrderStatusMutation = useUpdateOrderStatus();

  // Loading states for different actions
  const [actionStates, setActionStates] = useState({
    confirming: null as string | null,
    cancelling: null as string | null,
    completing: null as string | null,
    preparing: null as string | null,
    markingReady: null as string | null,
  });

  console.log("orders:", orders);
  console.log("roles:", roles);

  // Filter orders based on role and search term
  const getFilteredOrders = (ordersData: Order[], userRole: string) => {
    let filtered = ordersData;

    switch (userRole) {
      case "manager":
        filtered = ordersData; // See all orders
        break;
      case "cashier":
        filtered = ordersData; // See all orders
        break;
      case "chef":
        filtered = ordersData.filter(
          (order) =>
            order.status === "confirmed" || order.status === "preparing",
        );
        break;
      default:
        filtered = [];
    }

    // Apply search filter
    return filtered.filter((order) =>
      order.id.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  };

  const filteredOrders = getFilteredOrders(orders, role);

  // Generic function to update action states
  const setActionState = (
    action: keyof typeof actionStates,
    orderId: string | null,
  ) => {
    setActionStates((prev) => ({
      ...prev,
      [action]: orderId,
    }));
  };

  // Generic order status update function
  const updateOrderStatus = async (
    orderId: string,
    status: string,
    actionType: keyof typeof actionStates,
  ) => {
    try {
      setActionState(actionType, orderId);

      await updateOrderStatusMutation.mutateAsync({
        orderId,
        status,
      });

      // Refetch orders to get updated data
      await refetch();

      // Show success message based on action
      const messages = {
        confirming: "Order confirmed and sent to kitchen!",
        preparing: "Started preparing order",
        markingReady: "Order ready! Sent to cashier",
        completing: "Order completed!",
        cancelling: "Order cancelled",
      };

      showToast(
        messages[actionType] || "Order status updated",
        actionType === "cancelling" ? "error" : "success",
      );
    } catch (error) {
      console.error(`Failed to ${actionType} order:`, error);
      showToast(`Failed to ${actionType.replace("ing", "")} order`, "error");
    } finally {
      setActionState(actionType, null);
    }
  };

  // Specific handler functions
  const handleConfirmOrder = (orderId: string) =>
    updateOrderStatus(orderId, "confirmed", "confirming");

  const handleCancelOrder = (orderId: string) =>
    updateOrderStatus(orderId, "cancelled", "cancelling");

  const handleCompleteOrder = (orderId: string) =>
    updateOrderStatus(orderId, "completed", "completing");

  const handleStartPreparing = (orderId: string) =>
    updateOrderStatus(orderId, "preparing", "preparing");

  const handleMarkReady = (orderId: string) =>
    updateOrderStatus(orderId, "ready", "markingReady");

  // Modal handlers
  const handleViewDetails = (order: Order) => {
    setSelectedOrder(order);
    setShowDetailsModal(true);
  };

  const openUpdateModal = (order: Order) => {
    setSelectedOrder(order);
    setShowUpdateModal(true);
  };

  const handleUpdateStatus = async (orderId: string, status: string) => {
    try {
      await updateOrderStatusMutation.mutateAsync({
        orderId,
        status,
      });

      await refetch();
      setShowUpdateModal(false);
      setSelectedOrder(null);
      showToast("Order status updated", "success");
    } catch (error) {
      console.error("Failed to update order status:", error);
      showToast("Failed to update status", "error");
    }
  };

  // Utility functions (kept as you requested)
  const showToast = (message: string, type: "success" | "error") => {
    // In real app, use a proper toast library
    console.log(`${type.toUpperCase()}: ${message}`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ready":
        return "bg-green-500";
      case "preparing":
        return "bg-orange-500";
      case "on-the-way":
        return "badge-info";
      case "completed":
        return "badge-neutral";
      case "pending":
        return "bg-yellow-400";
      case "cancelled":
        return "bg-red-600 text-white";
      case "confirmed":
        return "bg-blue-500";
      default:
        return "badge-neutral";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "ready":
        return "Ready";
      case "preparing":
        return "Preparing";
      case "on-the-way":
        return "On The Way";
      case "completed":
        return "Completed";
      case "cancelled":
        return "Cancelled";
      case "pending":
        return "Pending";
      case "confirmed":
        return "Confirmed";
      default:
        return "Unknown";
    }
  };

  const getOrderTypeIcon = (type: Order["type"]) => {
    switch (type) {
      case "dine-in":
        return "🍽️";
      case "delivery":
        return "🚚";
      case "takeaway":
        return "📦";
      default:
        return "🍽️";
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "manager":
        return <User className="w-5 h-5" />;
      case "cashier":
        return <CreditCard className="w-5 h-5" />;
      case "chef":
        return <ChefHat className="w-5 h-5" />;
      default:
        return <User className="w-5 h-5" />;
    }
  };

  const getRoleTitle = (role: string) => {
    switch (role) {
      case "manager":
        return "Manager Dashboard";
      case "cashier":
        return "Cashier Dashboard";
      case "chef":
        return "Kitchen Dashboard";
      default:
        return "Orders Dashboard";
    }
  };

  const statusOptions = [
    { value: "pending", label: "Pending" },
    { value: "confirmed", label: "Confirmed" },
    { value: "preparing", label: "Preparing" },
    { value: "ready", label: "Ready" },
    { value: "on-the-way", label: "On The Way" },
    { value: "cancelled", label: "Cancelled" },
    { value: "completed", label: "Completed" },
  ];

  // Check if user has permission for specific actions based on roles
  const canPerformAction = (action: string) => {
    if (!roles || !role) return false;

    const userRole = roles.find((r: Role) => r.name === role);
    if (!userRole) return false;

    // You can implement your permission logic here
    // For example, check if userRole.permissions includes the action
    return userRole.permissions?.includes(action) || false;
  };

  // Loading and error states
  if (isLoading) return <div>Loading orders...</div>;
  if (isError) return <div>Error loading orders. Please try again.</div>;

  return {
    // Component state and data
    orders,
    filteredOrders,
    selectedOrder,
    showDetailsModal,
    showUpdateModal,
    searchTerm,
    role,
    roles,

    // Loading states
    isLoading: updateOrderStatusMutation.isPending,
    actionStates,

    // Event handlers
    handleViewDetails,
    handleConfirmOrder,
    handleCancelOrder,
    handleCompleteOrder,
    handleStartPreparing,
    handleMarkReady,
    handleUpdateStatus,
    openUpdateModal,
    setSearchTerm,
    setShowDetailsModal,
    setShowUpdateModal,

    // Utility functions
    getStatusColor,
    getStatusText,
    getOrderTypeIcon,
    getRoleIcon,
    getRoleTitle,
    canPerformAction,
    statusOptions,
    refetch,
  };
};

export default OrdersFunc;
