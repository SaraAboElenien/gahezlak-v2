import {
  CalendarClock,
  Hash,
  MessageSquareText,
  Phone,
  Store,
  User,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";

type Report = {
  senderFirstName: string;
  senderLastName: string;
  phoneNumber?: string;
  shopName?: string;
  message: string;
  createdAt: string;
  orderNumber?: string;
};

type Props = {
  reportSelected: Report | null;
  onClose: () => void;
};

export default function ReportDetailsModal({ reportSelected, onClose }: Props) {
  const { t } = useTranslation();

  if (!reportSelected) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white dark:bg-card rounded-2xl p-6 w-full max-w-xl shadow-2xl relative border border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t("adminReports.detailsTitle")}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-primary transition duration-200"
            title={t("adminReports.close")}
          >
            <X size={24} />
          </button>
        </div>

        <div className="grid gap-4 text-gray-800 dark:text-gray-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-gray-800 dark:text-gray-200">
            <div className="flex items-center gap-1">
              <DetailItem
                icon={<User className="text-primary mt-1" size={18} />}
                label={t("adminReports.name")}
                value={reportSelected.senderFirstName}
              />
              <div className="mt-4">{reportSelected.senderLastName} </div>
            </div>

            {/* <DetailItem
                icon={<Mail className="text-primary mt-1" size={18} />}
                label={t("adminReports.email")}
                value={reportSelected.senderEmail}
              /> */}

            {reportSelected.phoneNumber && (
              <DetailItem
                icon={<Phone className="text-primary mt-1" size={18} />}
                label={t("adminReports.phone")}
                value={reportSelected.phoneNumber}
              />
            )}

            {reportSelected.orderNumber && (
              <DetailItem
                icon={<Hash className="text-primary mt-1" size={18} />}
                label={t("orderNumber")}
                value={reportSelected.orderNumber}
              />
            )}

            {reportSelected.shopName && (
              <DetailItem
                icon={<Store className="text-primary mt-1" size={18} />}
                label={t("adminReports.shop")}
                value={reportSelected.shopName}
              />
            )}

            <DetailItem
              icon={<CalendarClock className="text-primary mt-1" size={18} />}
              label={t("adminReports.date")}
              value={new Date(reportSelected.createdAt).toLocaleString()}
            />

            <DetailItem
              icon={
                <MessageSquareText className="text-primary mt-1" size={18} />
              }
              label={t("adminReports.message")}
              value={reportSelected.message || t("adminReports.notAvailable")}
              fullWidth
              withTopBorder
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailItem({
  icon,
  label,
  value,
  fullWidth = false,
  withTopBorder = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  fullWidth?: boolean;
  withTopBorder?: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-3 ${fullWidth ? "sm:col-span-2" : ""} ${
        withTopBorder ? "border-t pt-4 dark:border-gray-700" : ""
      }`}
    >
      {icon}
      <div>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
          {label}
        </p>
        <p className="text-sm whitespace-pre-wrap">{value}</p>
      </div>
    </div>
  );
}
