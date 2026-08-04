import { useState, useEffect } from "react";
import { useLang } from "../hooks/useLang";
import { useTranslation } from "react-i18next";
import { Globe, Menu, LogOut, User } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { scrollToSection } from "../utils/scrollToSection";
import { useProfile } from "../hooks/useProfile";
// import toast from "react-hot-toast";
// import { useSignout } from "@/hooks/useAuth";

export default function Navbar() {
  const { toggleLanguage, currentLang } = useLang();
  const { t } = useTranslation();

  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const location = useLocation();
  const {
    user: userData,
    loading: isLoading,
    handleLogout,
    isLoggingOut,
  } = useProfile();

  const navigation = [
    { name: "features", href: "#features" },
    { name: "pricing", href: "#pricing" },
    { name: "FAQ", href: "#faq" },
    // { name: "Testimonials", href: "#testimonials" },
    { name: "about us", href: "#about" },
    { name: "contact us", href: "#contact" },
  ];

  const logout = () => {
    handleLogout();
  };

  useEffect(() => {
    const handleScroll = () => {
      // Adjust this value based on your hero section height
      const heroHeight = 200; // hero section height
      setIsScrolled(window.scrollY > heroHeight);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 z-50 w-full transition-all duration-300 py-1 dir-ltr ${
        isScrolled
          ? "bg-white/95 shadow-sm overflow-hidden"
          : "border-transparent bg-transparent overflow-hidden"
      }`}
    >
      {/* Enhanced Decorative Elements */}
      {isScrolled && (
        <>
          <div className="absolute top-0 right-0 w-10 h-10 opacity-70">
            <div className="w-full h-full bg-primary rounded-full blur-2xl animate-pulse"></div>
          </div>
          <div className="absolute top-0 left-0 w-10 h-10 opacity-70">
            <div className="w-full h-full bg-lighter-primary rounded-full blur-2xl animate-pulse"></div>
          </div>
          <div className="absolute top-2 left-1/2 w-16 h-16 opacity-40">
            <div className="w-full h-full bg-lighter-primary rounded-full blur-lg animate-pulse"></div>
          </div>
          <div className="absolute top-5 left-1/5 w-8 h-8 opacity-40">
            <div className="w-full h-full bg-lighter-primary rounded-full blur-lg animate-pulse"></div>
          </div>
          <div className="absolute top-8 right-1/3 w-8 h-8 opacity-40">
            <div className="w-full h-full bg-lighter-primary rounded-full blur-md animate-pulse"></div>
          </div>
          <div className="absolute top-4 left-1/3 w-12 h-12 opacity-40">
            <div className="w-full h-full bg-primary rounded-full blur-lg animate-pulse"></div>
          </div>
        </>
      )}

      {/* Main Navigation Container */}
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-20">
        <div className="flex h-16 items-center justify-between">
          {/* Left Side - Logo */}
          <div className="flex items-center">
            <img src="/qr-hand.png" width="30px" alt="logo" />
            <Link
              to="/"
              onClick={(e) => {
                if (location.pathname === "/") {
                  e.preventDefault();
                  scrollToSection("hero");
                }
              }}
              className="ml-3"
            >
              <h2
                className={`text-2xl md:text-3xl lg:text-3xl tracking-tight transition-colors duration-300 ${
                  isScrolled ? "text-black" : "text-black"
                }`}
                style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 200 }}
              >
                {t("gahez")}
                <span style={{ fontWeight: 400, fontStyle: "italic" }}>
                  {t("lak")}
                </span>
              </h2>
            </Link>
          </div>

          {/* Center - Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-8">
            {navigation.map((item) => (
              <a
                key={item.name}
                href={item.href}
                className={`text-lg font-medium transition-colors duration-300 ${
                  isScrolled
                    ? "text-slate-700 hover:text-lighter-primary"
                    : "text-black/90 hover:text-black"
                }`}
              >
                {t(item.name)}
              </a>
            ))}
          </nav>

          {/* Right Side - Actions */}
          <div className="flex items-center space-x-3 sm:space-x-4">
            {/* Language Toggle */}
            <button
              onClick={toggleLanguage}
              className={`px-5 sm:px-4 py-5 rounded-3xl transition-colors duration-300 text-xl border-1 ${
                isScrolled
                  ? "btn btn-outline bg-white border-gray-300 shadow-lg "
                  : "btn btn-ghost bg-white/70 hover:bg-white border-white/70 text-gray-900 backdrop-blur-sm border shadow-sm "
              }`}
            >
              <Globe className="h-4 w-4" />
              <span className="hidden sm:inline ml-2 ">
                {currentLang === "en" ? "العربية" : "English"}
              </span>
            </button>

            {/* Auth Buttons - Show skeleton while loading, then actual buttons */}
            {isLoading ? (
              <>
                <div className="hidden sm:flex items-center space-x-4">
                  <div className="h-12 w-24 rounded-3xl bg-gray-200 animate-pulse"></div>
                  <div className="h-12 w-28 rounded-3xl bg-gray-200 animate-pulse"></div>
                </div>
              </>
            ) : !isLoading && userData ? (
              <>
                {/* Dashboard Button */}
                <Link
                  to={
                    userData.role.name !== "admin"
                      ? "/dashboard/overview"
                      : "/admin-dashboard/overview"
                  }
                  className={`btn hidden sm:flex px-5 py-5 sm:px-6 transition-colors duration-300 border-1 rounded-3xl text-xl text-gray-900 font-normal ${
                    isScrolled
                      ? "btn-ghost hover:bg-white hover:border-primary"
                      : "btn-ghost hover:bg-white hover:border-primary"
                  }`}
                >
                  <User className="h-4 w-4 mr-2" />
                  {t("dashboard")}
                </Link>

                {/* Logout Button */}
                <button
                  onClick={handleLogout}
                  className={`btn shadow bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 px-5 py-5 sm:px-6 hidden sm:flex transition-colors duration-300 rounded-3xl text-xl text-white font-normal border-0`}
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  {isLoggingOut ? t("logingout") : t("logout")}
                </button>
              </>
            ) : (
              <>
                {/* Login Button */}
                <Link
                  to="/auth"
                  className={`btn hidden sm:flex px-5 py-5 sm:px-6 transition-colors duration-300 border-1 rounded-3xl text-xl text-gray-900 font-normal  ${
                    isScrolled
                      ? "btn-ghost hover:bg-white hover:border-primary"
                      : "btn-ghost hover:bg-white hover:border-primary"
                  }`}
                >
                  {t("login")}
                </Link>

                {/* Register Button */}
                <Link
                  to="/auth/register"
                  className={`btn shadow bg-gradient-to-r from-primary to-lighter-primary hover:from-darker-primary hover:to-primary px-5 py-5 sm:px-6  hidden sm:flex transition-colors duration-300 rounded-3xl text-xl text-gray-900 font-normal ${
                    isScrolled
                      ? "text-white  hover:text-white border-0 "
                      : " text-white hover:bg-darker-primary hover:text-white border-0 "
                  }`}
                >
                  {t("register")}
                </Link>
              </>
            )}

            {/* Mobile Menu */}
            <div
              className={`drawer drawer-end lg:hidden  ${
                currentLang == "ar" ? "dir-rtl" : "dir-ltr"
              }`}
            >
              <input
                id="mobile-drawer"
                type="checkbox"
                className="drawer-toggle"
                checked={isOpen}
                onChange={(e) => setIsOpen(e.target.checked)}
              />
              <div className="drawer-content">
                <label
                  htmlFor="mobile-drawer"
                  className={`btn btn-ghost btn-square ${
                    isScrolled ? "text-slate-700" : "text-black"
                  }`}
                >
                  <Menu className="h-5 w-5 transition-colors duration-300" />
                </label>
              </div>
              <div className="drawer-side z-50">
                <label
                  htmlFor="mobile-drawer"
                  aria-label="close sidebar"
                  className="drawer-overlay"
                ></label>
                <div className="min-h-full w-80 bg-base-100 text-base-content p-6">
                  <div className="flex flex-col gap-6 mt-8">
                    {/* Mobile Navigation */}
                    <div className="space-y-4 px-3">
                      <h3 className="text-lg font-semibold text-slate-900 mb-4 ">
                        {t("navigation")}
                      </h3>
                      {navigation.map((item) => (
                        <a
                          key={item.name}
                          href={item.href}
                          className="block text-slate-600 text-lg font-medium hover:text-primary transition-colors"
                          onClick={() => setIsOpen(false)}
                        >
                          {t(item.name)}
                        </a>
                      ))}
                    </div>
                    {/* Mobile Actions */}
                    <div className="space-y-3 pt-6 border-t border-slate-200">
                      {isLoading ? (
                        <>
                          <div className="w-full shadow flex items-center space-x-4">
                            <div className="h-12 w-24 rounded-3xl bg-gray-200 animate-pulse"></div>
                            <div className="h-12 w-28 rounded-3xl bg-gray-200 animate-pulse"></div>
                          </div>
                        </>
                      ) : !isLoading && userData ? (
                        <>
                          {/* Dashboard Button */}
                          <Link
                            to={
                              userData.role.name !== "admin"
                                ? "/dashboard/overview"
                                : "/admin-dashboard/overview"
                            }
                            className={`btn w-full shadow flex px-5 py-5 sm:px-6 transition-colors duration-300 border-1 rounded-3xl text-xl text-gray-900 font-normal ${
                              isScrolled
                                ? "btn-ghost hover:bg-white hover:border-primary"
                                : "btn-ghost hover:bg-white hover:border-primary"
                            }`}
                          >
                            <User className="h-4 w-4 mr-2" />
                            {t("dashboard")}
                          </Link>

                          {/* Logout Button */}
                          {isLoggingOut ? (
                            <button
                              onClick={logout}
                              className={`btn  bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 px-5 py-5 sm:px-6 w-full  flex transition-colors duration-300 rounded-3xl text-xl text-white font-normal border-0`}
                            >
                              <LogOut className="h-4 w-4 mr-2" />{" "}
                              {isLoggingOut ? t("logingout") : t("logout")}{" "}
                            </button>
                          ) : (
                            t("logout")
                          )}
                        </>
                      ) : (
                        <>
                          {/* Login Button */}
                          <Link
                            to="/auth"
                            className={`btn w-full shadow flex px-5 py-5 sm:px-6 transition-colors duration-300 border-1 rounded-3xl text-xl text-gray-900 font-normal  ${
                              isScrolled
                                ? "btn-ghost hover:bg-white hover:border-primary"
                                : "btn-ghost hover:bg-white hover:border-primary"
                            }`}
                          >
                            {t("login")}
                          </Link>

                          {/* Register Button */}
                          <Link
                            to="/auth/register"
                            className={`btn  bg-gradient-to-r from-primary to-lighter-primary hover:from-darker-primary hover:to-primary px-5 py-5 sm:px-6  w-full shadow flex transition-colors duration-300 rounded-3xl text-xl text-gray-900 font-normal ${
                              isScrolled
                                ? "text-white  hover:text-white border-0 "
                                : " text-white hover:bg-darker-primary hover:text-white border-0 "
                            }`}
                          >
                            {t("register")}
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
