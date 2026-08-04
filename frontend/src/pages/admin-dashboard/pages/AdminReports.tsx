import Loader from "@/components/Loader";
import ReportDetailsModal from "@/components/ReportModal";
import { useAdminReports } from "@/hooks/useReports";
import { Eye, MessageSquareMore } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

type Report = {
  _id: string;
  senderFirstName: string;
  senderLastName: string;
  receiver: string;
  message: string;
  phoneNumber: string;
  shopName: string;
  createdAt: string;
};

export default function AdminReports() {
  const { data, isLoading } = useAdminReports();
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  const { t } = useTranslation();

  const shortenMessage = (msg: string, wordLimit: number) => {
    const words = msg.split(" ");
    return words.length > wordLimit
      ? words.slice(0, wordLimit).join(" ") + " ..."
      : msg;
  };

  //   const data = {
  //     "message": "Admin reports retrieved successfully",
  //     "data": [
  //         {
  //             "_id": "68841ac605980c45201b1890",
  //             "senderName": "Sara",
  //             "senderEmail": "sara@example.com",
  //             "receiver": "admin",
  //             "message": "Your app is amazing but I have a suggestion.",
  //             "phoneNumber": 123456789,
  //             "shopName": "Pizza Queen",
  //             "createdAt": "2025-07-26T00:01:10.044Z",
  //             "updatedAt": "2025-07-26T00:01:10.044Z",
  //             "__v": 0
  //         },
  //         {
  //             "_id": "6883135254b27af08c62990c",
  //             "senderName": "Ahmed Ali",
  //             "senderEmail": "ahmed@example.com",
  //             "receiver": "admin",
  //             "message": "I really like your platform, but I had a small issue with the login.",
  //             "createdAt": "2025-07-25T05:17:06.393Z",
  //             "updatedAt": "2025-07-25T05:17:06.393Z",
  //             "__v": 0
  //         },
  //     ]
  // }

  if (isLoading) return <Loader />;

  return (
    <div className="p-2 md:p-6">
      <div className="container mx-auto p-5 md:p-10 bg-white min-h-screen rounded-md shadow">
        <div className="flex items-center gap-4">
          <div className="w-14 md:w-16 h-14 md:h-16 bg-gradient-to-br from-primary to-darker-primary rounded-2xl flex items-center justify-center shadow ">
            <MessageSquareMore className="w-5 md:w-8 h-5 md:h-8 text-white" />
          </div>
          <div className="flex flex-col gap-3">
            <h1 className="  md:text-4xl font-bold text-gray-900 dark:text-white ">
              {t("adminReports.title")}
            </h1>
            <p className="text-sm md:text-lg text-gray-600 dark:text-gray-300 ">
              {t("adminReports.description")}
            </p>
          </div>
        </div>
        <div className="overflow-x-auto bg-white dark:bg-card rounded-md shadow mt-10">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-100 dark:bg-gray-800">
              <tr className="text-sm text-gray-500 uppercase">
                <th className="px-6 py-3 text-left">
                  {t("adminReports.name")}
                </th>
                {/* <th className="px-6 py-3 text-left">{t("adminReports.email")}</th> */}
                <th className="px-6 py-3 text-left">
                  {t("adminReports.shop")}
                </th>
                <th className="px-6 py-3 text-left">
                  {t("adminReports.date")}
                </th>
                <th className="px-6 py-3 text-left">
                  {t("adminReports.message")}
                </th>
                <th className="px-6 py-3 text-left"></th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-card divide-y divide-gray-200 dark:divide-gray-700">
              {(data?.data?.length ?? 0) > 0 ? (
                // The backend response shape (see @/types/report's Report) doesn't
                // exactly match this component's local Report type (e.g. phoneNumber
                // string vs number) - pre-existing inconsistency, bridged here rather
                // than widening scope to reconcile the shared type / ReportModal's
                // own local type as well.
                (data!.data as unknown as Report[]).map((report) => (
                  <tr key={report._id}>
                    <td className="px-6 py-4 font-medium">
                      {report.senderFirstName} {report.senderLastName}
                    </td>
                    {/* <td className="px-6 py-4">{report.senderEmail}</td> */}
                    <td className="px-6 py-4">{report.shopName || "-"}</td>
                    <td className="px-6 py-4">
                      {new Date(report.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-xs">
                      {report.message
                        ? shortenMessage(report.message, 10)
                        : "-"}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        className="btn btn-ghost btn-sm text-primary hover:animate-bounce"
                        onClick={() => setSelectedReport(report)}
                        title={t("adminReports.view")}
                      >
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-gray-400">
                    {t("adminReports.noData")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Modal */}
        {selectedReport && (
          <ReportDetailsModal
            reportSelected={selectedReport}
            onClose={() => setSelectedReport(null)}
          />
        )}
      </div>
    </div>
  );
}
