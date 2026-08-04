import { Edit } from "lucide-react";
import { useTranslation } from "react-i18next";
import Modal from "@/components/ui/Modal";

interface Option {
  label: string;
  value: string;
}

interface Order {
  orderNumber: number;
  orderStatus: string;
}

interface UpdateStatusModalProps {
  show: boolean;
  onClose: () => void;
  order: Order | null;
  newStatus: string;
  setNewStatus: (value: string) => void;
  onUpdateStatus: () => void;
  isPending: boolean;
  statusOptions: Option[];
}

export default function UpdateStatusModal({
  show,
  onClose,
  order,
  newStatus,
  setNewStatus,
  onUpdateStatus,
  isPending,
  statusOptions,
}: UpdateStatusModalProps) {
  const { t } = useTranslation();

  if (!order) return null;

  return (
    <Modal
      isOpen={show}
      onClose={onClose}
      title={t("updateOrderStatus")}
      actions={
        <>
          <button
            className="btn bg-red-600 text-white rounded-3xl"
            onClick={onClose}
          >
            {t("cancel")}
          </button>

          <button
            className="btn bg-blue-600 text-white rounded-3xl"
            onClick={onUpdateStatus}
            disabled={isPending}
          >
            {isPending ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                {t("updating")}
              </>
            ) : (
              <>
                <Edit className="w-4 h-4" />
                {t("update")}
              </>
            )}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-base-content/70 mb-2">
            {t("orderNumber")}
          </p>
          <p className="text-base-content">{order.orderNumber}</p>
        </div>

        <div>
          <p className="text-sm font-semibold text-base-content/70 mb-2">
            {t("currentStatus")}
          </p>
          <span className="badge px-3 py-1 rounded-2xl">
            {order.orderStatus}
          </span>
        </div>

        <div>
          <p className="text-sm font-semibold text-base-content/70 mb-2">
            {t("newStatus")}
          </p>
          <select
            className="select select-bordered w-full border-1 border-primary focus:outline-0"
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  );
}
