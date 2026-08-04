import InputField from "@/components/InputField";
import { ListOrdered } from "lucide-react";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { getOrderByNumber } from "@/services/OrderApi";
import { useLang } from "@/hooks/useLang";
import { useTranslation } from "react-i18next";
import type { OrderStatus } from "@/types/order";
import { useSearchParams } from "react-router-dom";
import MenuReport from "./MenuReport";

type OrderId = {
  OrderId: string;
};

export default function Track() {
  const [orderNumber, setOrderNumber] = useState<string>("");
  const { currentLang } = useLang();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  // Check for order number in URL parameters first, then localStorage
  useEffect(() => {
    const urlOrderNumber = searchParams.get("orderNumber");
    if (urlOrderNumber) {
      setOrderNumber(urlOrderNumber);
    } else {
      // If no URL parameter, check localStorage (for access from OrderStatusPage)
      const lastOrderNumber = localStorage.getItem("lastOrderNumber");
      if (lastOrderNumber) {
        setOrderNumber(lastOrderNumber);
      }
    }
  }, [searchParams]);

  // Function to get status color based on order status
  const getStatusColor = (status: OrderStatus): string => {
    switch (status) {
      case "Pending":
        return "text-yellow-600 bg-yellow-100";
      case "Confirmed":
        return "text-blue-600 bg-blue-100";
      case "InProgress":
        return "text-orange-600 bg-orange-100";
      case "Preparing":
        return "text-purple-600 bg-purple-100";
      case "Ready":
        return "text-green-600 bg-green-100";
      case "Delivered":
        return "text-green-700 bg-green-200";
      case "Cancelled":
        return "text-red-600 bg-red-100";
      default:
        return "text-gray-600 bg-gray-100";
    }
  };

  // Function to translate order status
  const translateStatus = (status: OrderStatus): string => {
    switch (status) {
      case "Pending":
        return t("publicMenu.statusPending");
      case "Confirmed":
        return t("publicMenu.statusConfirmed");
      case "InProgress":
        return t("publicMenu.statusInProgress");
      case "Preparing":
        return t("publicMenu.statusPreparing");
      case "Ready":
        return t("publicMenu.statusReady");
      case "Delivered":
        return t("publicMenu.statusDelivered");
      case "Cancelled":
        return t("publicMenu.statusCancelled");
      default:
        return status;
    }
  };

  // !Function to get location display
  const getLocationDisplay = (tableNumber?: number): string => {
    if (tableNumber && tableNumber > 0) {
      return currentLang === "ar"
        ? `طاولة ${tableNumber}`
        : `Table ${tableNumber}`;
    }
    return currentLang === "ar" ? "طلب خارجي" : "Takeaway";
  };

  const {
    register: registerOrder,
    handleSubmit: handleSubmitOrder,
    setValue: setValueOrder,
    formState: { errors: orderErrors },
  } = useForm<OrderId>();

  // Set the form value when orderNumber changes
  useEffect(() => {
    if (orderNumber) {
      setValueOrder("OrderId", orderNumber);
    }
  }, [orderNumber, setValueOrder]);

  const {
    data: orderData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["order", orderNumber],
    queryFn: () => getOrderByNumber(orderNumber),
    enabled: !!orderNumber,
    refetchInterval: 15000,
  });

  const onSubmitOrder = async (data: OrderId) => {
    setOrderNumber(data.OrderId);
    refetch();
  };

  return (
    <div className="max-w-5xl min-h-[70vh] mx-auto p-3 sm:p-4 md:p-6 bg-white shadow-lg rounded-lg mb-20">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-800">
          {t("publicMenu.trackOrder")}
        </h2>
      </div>

      {/* Order Tracking Form */}
      <form onSubmit={handleSubmitOrder(onSubmitOrder)} className="space-y-4">
        <InputField
          label=""
          id="text"
          type="text"
          placeholder={t("publicMenu.orderNumberPlaceholder")}
          icon={<ListOrdered className="text-gray-900 w-4 h-4" />}
          register={registerOrder("OrderId", {
            minLength: {
              value: 4,
              message: t("publicMenu.orderNumberValidation"),
            },
          })}
          error={orderErrors.OrderId}
          errorMessage={orderErrors.OrderId?.message}
        />

        <button
          type="submit"
          disabled={isLoading}
          className="btn btn-gradient w-full border-0 text-white py-2 mt-2 text-sm sm:text-base"
        >
          {isLoading ? t("publicMenu.searching") : t("publicMenu.search")}
        </button>
      </form>

      {/* Results Section */}
      <div className="mt-6">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">
          {t("publicMenu.searchResults")}
        </h3>

        {/* Mobile Card Layout */}
        <div className="block sm:hidden">
          {isLoading && orderNumber && (
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-menu-primary"></div>
                <span className="text-gray-600 text-sm">
                  {t("publicMenu.searching")}
                </span>
              </div>
            </div>
          )}

          {error && !isLoading && (
            <div className="bg-red-50 rounded-lg p-4 text-center">
              <span className="text-red-500 text-sm">
                {t("publicMenu.noOrderFound")}
              </span>
            </div>
          )}

          {orderData?.data && !isLoading && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-600">
                  {t("publicMenu.orderNumber")}:
                </span>
                <span className="text-sm font-semibold">
                  #{orderData.data.orderNumber}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-600">
                  {t("publicMenu.orderStatus")}:
                </span>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                    orderData.data.orderStatus as OrderStatus,
                  )}`}
                >
                  {translateStatus(orderData.data.orderStatus as OrderStatus)}
                </span>
              </div>
              {/*! Location */}
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-600">
                  {currentLang === "ar" ? "الموقع" : "Location"}:
                </span>
                <span className="text-sm font-semibold">
                  {getLocationDisplay(orderData.data.tableNumber)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-600">
                  {t("publicMenu.totalAmount")}:
                </span>
                <span className="text-sm font-semibold">
                  {orderData.data.totalAmount} EGP
                </span>
              </div>
            </div>
          )}

          {!orderData?.data && !error && !isLoading && orderNumber && (
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <span className="text-gray-500 text-sm">
                {t("publicMenu.noOrderFound")}
              </span>
            </div>
          )}
        </div>

        {/* Desktop Table Layout */}
        <div className="hidden sm:block overflow-x-auto">
          <table
            className={`w-full text-sm border border-gray-200 rounded ${
              currentLang === "ar" ? "text-right" : "text-left"
            } text-gray-900`}
          >
            <thead className="bg-gray-100 text-gray-900 font-semibold">
              <tr className="text-center">
                <th className="px-4 py-2">{t("publicMenu.orderNumber")}</th>
                <th className="px-4 py-2">{t("publicMenu.orderStatus")}</th>
                <th className="px-4 py-2">
                  {currentLang === "ar" ? "الموقع" : "Location"}
                </th>
                <th className="px-4 py-2">{t("publicMenu.totalAmount")}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && orderNumber && (
                <tr className="text-center">
                  <td colSpan={4} className="px-4 py-2">
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-menu-primary"></div>
                      <span className="text-gray-600">
                        {t("publicMenu.searching")}
                      </span>
                    </div>
                  </td>
                </tr>
              )}
              {error && !isLoading && (
                <tr className="text-center">
                  <td colSpan={4} className="px-4 py-2 text-red-500">
                    {t("publicMenu.noOrderFound")}
                  </td>
                </tr>
              )}
              {orderData?.data && !isLoading && (
                <tr className="text-center">
                  <td className="px-4 py-2">#{orderData.data.orderNumber}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(
                        orderData.data.orderStatus as OrderStatus,
                      )}`}
                    >
                      {translateStatus(
                        orderData.data.orderStatus as OrderStatus,
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {getLocationDisplay(orderData.data.tableNumber)}
                  </td>
                  <td className="px-4 py-2">
                    {orderData.data.totalAmount} EGP
                  </td>
                </tr>
              )}
              {!orderData?.data && !error && !isLoading && orderNumber && (
                <tr className="text-center">
                  <td colSpan={4} className="px-4 py-2 text-gray-500">
                    {t("publicMenu.noOrderFound")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reviews Section */}
      <MenuReport orderNumber={orderNumber} />
    </div>
  );
}
