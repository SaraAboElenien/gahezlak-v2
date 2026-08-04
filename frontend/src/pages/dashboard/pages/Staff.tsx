import { Plus, Users } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import StaffModal from "@/components/dashboard-staff/StaffModal";
import { useModal } from "@/hooks/useModal";
import { useStaff } from "@/hooks/useStaff";
import Loader from "@/components/Loader";
import { ErrorComponent } from "@/components/ErrorComponent";
import { useProfile } from "@/hooks/useProfile";
import StaffCard from "@/components/dashboard-staff/StaffCard";

const Staff = () => {
  const { t } = useTranslation();
  const addStaffModal = useModal();
  const { user: userData } = useProfile();
  const { useShopQuery, useMembersQuery } = useStaff();
  const {
    data: shopData,
    isLoading: shopLoading,
    error: shopError,
  } = useShopQuery(userData?.shop?._id);
  const {
    data: members,
    isLoading: memberLoading,
    error: memberError,
  } = useMembersQuery(userData?.shop?._id);

  const isLoading = shopLoading || memberLoading;
  const error = shopError || memberError;

  if (isLoading || !shopData?.data._id) return <Loader />;
  if (error) return <ErrorComponent error={error.message} />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Hero Header */}
      <div className="bg-white dark:bg-card shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            {/* Title Section */}
            <div className="flex items-center gap-4">
              <motion.div
                className="w-16 h-16 bg-gradient-to-br from-primary to-darker-primary rounded-2xl flex items-center justify-center shadow-lg"
                whileHover={{
                  scale: 1.1,
                  rotate: 180,
                  transition: { duration: 0.5 },
                }}
              >
                <Users className="w-8 h-8 text-white" />
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
                  {t("staffPage.title") || "Staff Management"}
                </h1>
                <p className="text-lg text-gray-600 dark:text-gray-300">
                  {t("staffPage.description") ||
                    "Manage your restaurant staff members and their roles"}
                </p>
              </motion.div>
            </div>

            {/* Add Staff Button */}
            <motion.button
              onClick={addStaffModal.open}
              className="btn-gradient flex items-center cursor-pointer space-x-2 text-white px-6 py-3 rounded-lg transition-colors shadow-md hover:shadow-lg"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
            >
              <Plus className="h-5 w-5" />
              <span>{t("staffPage.addStaff") || "Add Staff Member"}</span>
            </motion.button>
          </div>
        </div>
      </div>

      {/* Staff List */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="card-background dark:bg-card rounded-xl shadow-md overflow-hidden border border-gray-100 dark:border-gray-700">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {t("staffPage.staffMembers") || "Staff Members"}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {shopData?.data.members.length}{" "}
                {t("staffPage.activeMembers") || "active members"}
              </p>
            </div>
            <div className="mt-3 sm:mt-0">
              <div className="relative"></div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t("staffPage.name") || "Name"}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t("staffPage.email") || "E-mail"}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t("staffPage.phone") || "Phone"}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t("staffPage.role") || "Role"}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t("staffPage.actions") || "Actions"}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-card divide-y divide-gray-200 dark:divide-gray-700">
                {members?.data.map((member) => (
                  <StaffCard
                    key={member.userId._id}
                    member={member}
                    shopId={shopData?.data._id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal */}
      <StaffModal
        isOpen={addStaffModal.isOpen}
        onClose={addStaffModal.close}
        shopId={shopData?.data._id}
      />
    </div>
  );
};

export default Staff;
