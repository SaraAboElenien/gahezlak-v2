// components/OrderDetailsModal.tsx
import React from "react";
import MenuItemDetails from "./MenuItemDetails";
import { useTranslation } from "react-i18next";
import type { Order } from "@/types/order";
import { useLang } from "@/hooks/useLang";
import Modal from "@/components/ui/Modal";

interface OrderDetailsModalProps {
  selectedOrder: Order | null;
  show: boolean;
  onClose: () => void;
}

const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({
  selectedOrder,
  show,
  onClose,
}) => {
  const { currentLang } = useLang();
  const { t } = useTranslation();

  if (!selectedOrder) return null;

  return (
    <Modal isOpen={show} onClose={onClose} title={t("orderDetails")} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-semibold text-base-content/70">
              {t("orderNumber")}
            </p>
            <p className="text-base-content">{selectedOrder.orderNumber}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-base-content/70">
              {t("tableOrLocation")}
            </p>
            <p className="text-base-content">
              {" "}
              {selectedOrder.tableNumber && (
                <span> {selectedOrder.tableNumber}</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-base-content/70">
              {t("customer")}
            </p>
            <p className="text-base-content">
              {selectedOrder.customerFirstName} {selectedOrder.customerLastName}
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-base-content/70">
              {t("phone")}
            </p>
            <p className="text-base-content">
              {selectedOrder.customerPhoneNumber}
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-base-content/70">
              {t("time")}
            </p>
            <p className="text-base-content">
              {new Date(selectedOrder.createdAt).toLocaleTimeString()}
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-base-content/70">
              {t("paymentStatus")}
            </p>
            <p className="text-base-content">
              {selectedOrder.orderStatus === "Pending"
                ? t("pending")
                : t("Paid")}
            </p>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-base-content/70 mb-2">
            {t("orderItems")}
          </p>
          <div className="bg-base-200 rounded-lg p-3">
            <ul className="space-y-4">
              {selectedOrder.orderItems.map((item) => (
                <li key={item._id}>
                  {/* Existing item rendering */}
                  <MenuItemDetails
                    itemId={item.menuItem._id}
                    quantity={item.quantity}
                  />

                  {/* Options and Choices Display */}
                  {item.menuItem.options?.length > 0 && (
                    <div className="ml-4 mt-2 space-y-2 text-sm text-base-content/80">
                      {item.menuItem.options.map(
                        (option) =>
                          option.choices?.length > 0 && (
                            <div key={option._id}>
                              <p className="font-medium">
                                {currentLang === "ar"
                                  ? option.name?.ar
                                  : option.name?.en}
                              </p>
                              <ul className="list-disc list-inside ml-2">
                                {option.choices.map((choice) => (
                                  <li key={choice._id}>
                                    {currentLang === "ar"
                                      ? choice.name?.ar
                                      : choice.name?.en}{" "}
                                    - {choice.price}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ),
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm font-semibold text-base-content/70">
              {t("status")}
            </p>
            <span className="badge px-3 py-1 rounded-2xl">
              {t(selectedOrder.orderStatus.toLowerCase())}
            </span>
          </div>
          <div>
            <p className="text-sm font-semibold text-base-content/70">
              {t("total")}
            </p>
            <p className="text-xl font-bold text-primary">
              {selectedOrder.totalAmount}
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default OrderDetailsModal;
