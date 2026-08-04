import { QrCode, Star, Users } from "lucide-react";
import AnimatedBackgroundIcons from "./../AnimatedBackgroundIcons";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function HeroSection3() {
  const { t } = useTranslation();

  return (
    <header>
      <div className="relative min-h-screen bg-gradient-to-br from-green-50 via-purple-50 to-green-50 overflow-hidden">
        {/* Animated Background Gradient and Icons */}
        <AnimatedBackgroundIcons />

        {/* Hero Content */}
        <div className="relative max-w-full mx-auto z-10 px-4 sm:px-6 lg:px-8 pt-24 pb-32">
          <div className="text-center">
            {/* Badge */}
            <div className="inline-flex items-center px-4 py-2 bg-white/30 backdrop-blur-md rounded-full border border-primary/70 shadow-lg mb-3">
              <span className="text-sm font-medium text-gray-700">
                {t("landing.hero.badge")}
              </span>
            </div>

            {/* Main Heading */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl text-gray-900 mb-6 leading-tight tracking-tighter">
              <span className="block">{t("landing.hero.title")}</span>
              <span className="block  text-gray-900 bg-clip-text ">
                {t("landing.hero.titleHighlight")}{" "}
                <span className="highlight inline-block py-5 text-gray-300 ">
                  {t("landing.hero.titleHighlightText")}{" "}
                </span>
              </span>
            </h1>

            {/* Desscription */}
            <p className="text-xl sm:text-2xl sm:px-9 text-gray-600 mb-12 max-w-4xl mx-auto tracking-tighter ">
              {t("landing.hero.description")}
            </p>

            {/* Quick actions Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
              <Link
                to="/auth/register"
                className="group btn-gradient text-white px-8 py-4 rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 transform"
              >
                <span className="flex items-center gap-2">
                  {t("landing.hero.startFree")}
                </span>
              </Link>
              <Link
                to="/shops/demo"
                className="group bg-white/20 backdrop-blur-md text-gray-700 px-8 py-4 rounded-xl font-semibold text-lg border-primary/50 border hover:bg-white/30 transition-all duration-300 hover:scale-105 transform"
              >
                <span className="flex items-center gap-2">
                  {t("landing.hero.viewDemo")}
                  <div className="w-3 h-3 bg-primary rounded-full animate-pulse"></div>
                </span>
              </Link>
            </div>

            {/* Main Features */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-7xl mx-auto">
              <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
                <div className="w-12 h-12 bg-gradient-to-r from-primary to-lighter-primary rounded-lg flex items-center justify-center mx-auto mb-4">
                  <QrCode className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {t("landing.mainFeatures.smartMenus.title")}
                </h3>
                <p className="text-gray-600">
                  {t("landing.mainFeatures.smartMenus.description")}
                </p>
              </div>

              <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
                <div className="w-12 h-12 bg-gradient-to-r from-primary to-lighter-primary rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {t("landing.mainFeatures.orderManagement.title")}
                </h3>
                <p className="text-gray-600">
                  {t("landing.mainFeatures.orderManagement.description")}
                </p>
              </div>

              <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
                <div className="w-12 h-12 bg-gradient-to-r from-primary to-lighter-primary rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Star className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {t("landing.mainFeatures.reports.title")}
                </h3>
                <p className="text-gray-600">
                  {t("landing.mainFeatures.reports.description")}
                </p>
              </div>
            </div>

            {/* Stats */}
            <div className="flex flex-col sm:flex-row gap-8 justify-center items-center mt-16 text-center">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-gray-600">
                  {t("landing.stats.freeTrial")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-gray-600">
                  {t("landing.stats.noInstallation")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-gray-600">
                  {t("landing.stats.support")}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom gradient fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent"></div>
      </div>
    </header>
  );
}
