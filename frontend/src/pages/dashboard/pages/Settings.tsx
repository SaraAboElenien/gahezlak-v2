import { useState } from "react";
import { Settings, User, Store } from "lucide-react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import RestaurantSettings from "@/components/dashboard-settings/RestaurantSettings";
import OwnerSettings from "@/components/dashboard-settings/OwnerSettings";

const SettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"restaurant" | "owner">(
    "restaurant",
  );

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
              <motion.div
                className="w-16 h-16 bg-gradient-to-br from-primary to-darker-primary rounded-2xl flex items-center justify-center shadow-lg"
                whileHover={{
                  scale: 1.1,
                  rotate: 180,
                  transition: { duration: 0.5 },
                }}
              >
                <Settings className="w-8 h-8 text-white" />
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
                  {t("settings.title") || "Settings"}
                </h1>
                <p className="text-lg text-gray-600 dark:text-gray-300">
                  {t("settings.description") ||
                    "Configure your restaurant and account preferences"}
                </p>
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="bg-white dark:bg-card rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-2 mb-6">
          <div className="flex">
            <motion.button
              whileHover="hover"
              whileTap="tap"
              onClick={() => setActiveTab("restaurant")}
              className={`flex-1 flex items-center justify-center gap-3 px-6 py-4 rounded-lg font-medium transition-all duration-200 ${
                activeTab === "restaurant"
                  ? "bg-primary text-white shadow-lg"
                  : "text-gray-600 dark:text-gray-300 hover:text-primary hover:bg-primary/10"
              }`}
            >
              <motion.div
                whileHover={{ rotate: 5 }}
                transition={{ duration: 0.3 }}
              >
                <Store className="w-5 h-5" />
              </motion.div>
              <div className="flex flex-col items-start">
                <span className="text-sm font-semibold">
                  {t("settings.restaurant.title") || "Restaurant Settings"}
                </span>
                <span className="text-xs opacity-75 hidden sm:block">
                  {t("settings.restaurant.subtitle") ||
                    "Menu, categories & items"}
                </span>
              </div>
            </motion.button>

            <motion.button
              whileHover="hover"
              whileTap="tap"
              onClick={() => setActiveTab("owner")}
              className={`flex-1 flex items-center justify-center gap-3 px-6 py-4 rounded-lg font-medium transition-all duration-200 ${
                activeTab === "owner"
                  ? "bg-primary text-white shadow-lg"
                  : "text-gray-600 dark:text-gray-300 hover:text-primary hover:bg-primary/10"
              }`}
            >
              <motion.div
                whileHover={{ scale: 1.1 }}
                transition={{ duration: 0.3 }}
              >
                <User className="w-5 h-5" />
              </motion.div>
              <div className="flex flex-col items-start">
                <span className="text-sm font-semibold">
                  {t("settings.owner.title") || "Owner Settings"}
                </span>
                <span className="text-xs opacity-75 hidden sm:block">
                  {t("settings.owner.subtitle") ||
                    "Profile, business & account"}
                </span>
              </div>
            </motion.button>
          </div>
        </div>

        {/* Tab Content */}
        <div key={activeTab} className="transition-all duration-300">
          {activeTab === "restaurant" && <RestaurantSettings />}
          {activeTab === "owner" && <OwnerSettings />}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
