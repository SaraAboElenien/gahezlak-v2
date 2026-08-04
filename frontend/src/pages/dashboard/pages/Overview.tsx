import { useProfile } from "../../../hooks/useProfile";
import {
  PartyPopper,
  Utensils,
  QrCode,
  Users,
  TrendingUp,
  ClipboardList,
  CreditCard,
  UserCheck,
} from "lucide-react";
import { useTranslation } from "react-i18next";

export default function Overview() {
  const { user: profileData, loading: isLoading } = useProfile();
  const { t } = useTranslation();

  // Show loading spinner while profile data is being fetched
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">{t("loading-dashboard")}</p>
        </div>
      </div>
    );
  }

  // Get restaurant name from profile data
  const restaurantName = profileData?.shop?.name;

  return (
    <div
      className={`min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900`}
    >
      {/* Hero Header */}
      <div className="bg-white dark:bg-card shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            {/* Title Section */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-primary to-darker-primary rounded-2xl flex items-center justify-center shadow-lg">
                <PartyPopper className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2 uppercase">
                  {t("Welcome to Gahezlak")},{" "}
                  <span className="text-primary">{restaurantName}!</span>
                </h1>
                <p className="text-lg text-gray-600 dark:text-gray-300">
                  {t("overview-desc")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Quick Start Guide */}
        <div className="bg-white dark:bg-card rounded-2xl shadow-lg p-8">
          <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-3">
            <span className="text-primary">
              <TrendingUp className="w-6 h-6" />
            </span>
            {t("quick-start-guide")}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-xl p-6 border border-blue-200 dark:border-blue-700">
              <div className="text-primary mb-4">
                <Utensils className="w-8 h-8" />
              </div>
              <h4 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">
                {t("set-up-menu")}
              </h4>
              <p className="text-gray-600 dark:text-gray-300 text-sm">
                {t("set-up-menu-desc")}
              </p>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-xl p-6 border border-green-200 dark:border-green-700">
              <div className="text-primary mb-4">
                <QrCode className="w-8 h-8" />
              </div>
              <h4 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">
                {t("generate-qr")}
              </h4>
              <p className="text-gray-600 dark:text-gray-300 text-sm">
                {t("generate-qr-desc")}
              </p>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-xl p-6 border border-purple-200 dark:border-purple-700">
              <div className="text-primary mb-4">
                <Users className="w-8 h-8" />
              </div>
              <h4 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">
                {t("manage-staff")}
              </h4>
              <p className="text-gray-600 dark:text-gray-300 text-sm">
                {t("manage-staff-desc")}
              </p>
            </div>
          </div>
        </div>

        {/* Features Preview */}
        <div className="bg-white dark:bg-card rounded-2xl shadow-lg p-8">
          <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-3">
            <span className="text-primary">
              <PartyPopper className="w-6 h-6" />
            </span>
            {t("what-you-can-do")}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-start gap-4">
              <div className="bg-primary/10 p-3 rounded-lg">
                <ClipboardList className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-800 dark:text-white mb-1">
                  {t("digital-menu-management")}
                </h4>
                <p className="text-gray-600 dark:text-gray-300 text-sm">
                  {t("digital-menu-management-desc")}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="bg-primary/10 p-3 rounded-lg">
                <CreditCard className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-800 dark:text-white mb-1">
                  {t("secure-payments")}
                </h4>
                <p className="text-gray-600 dark:text-gray-300 text-sm">
                  {t("secure-payments-desc")}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="bg-primary/10 p-3 rounded-lg">
                <TrendingUp className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-800 dark:text-white mb-1">
                  {t("real-time-analytics")}
                </h4>
                <p className="text-gray-600 dark:text-gray-300 text-sm">
                  {t("real-time-analytics-desc")}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="bg-primary/10 p-3 rounded-lg">
                <UserCheck className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-800 dark:text-white mb-1">
                  {t("staff-management")}
                </h4>
                <p className="text-gray-600 dark:text-gray-300 text-sm">
                  {t("staff-management-desc")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
