// import { Link } from "react-router-dom";
// import { useTranslation } from "react-i18next";
// import { Globe, Menu, X } from "lucide-react";
// import { useLang } from "../hooks/useLang";

export default function NavbarSec() {
  return (
    <nav className="relative z-50 bg-white/80 backdrop-blur-md border-b border-white/20 dir-ltr">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-2 gap-2">
            <div className="w-8 h-8 bg-gradient-to-r from-orange-500 to-red-500 rounded-lg flex items-center justify-center bg-transparent text-black">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                className="lucide lucide-qr-code w-7 h-7 text-black  "
              >
                <rect width="5" height="5" x="3" y="3" rx="1"></rect>
                <rect width="5" height="5" x="16" y="3" rx="1"></rect>
                <rect width="5" height="5" x="3" y="16" rx="1"></rect>
                <path d="M21 16h-3a2 2 0 0 0-2 2v3"></path>
                <path d="M21 21v.01"></path>
                <path d="M12 7v3a2 2 0 0 1-2 2H7"></path>
                <path d="M3 12h.01"></path>
                <path d="M12 3h.01"></path>
                <path d="M12 16v.01"></path>
                <path d="M16 12h1"></path>
                <path d="M21 12v.01"></path>
                <path d="M12 21v-1"></path>
              </svg>
            </div>
            <span className="text-xl font-bold text-gray-900">Gahezlak</span>
          </div>
          <div className="hidden md:flex items-center space-x-8">
            <a
              href="#"
              className="text-gray-700 hover:text-orange-600 transition-colors"
            >
              المنتج
            </a>
            <a
              href="#"
              className="text-gray-700 hover:text-orange-600 transition-colors"
            >
              الخطط
            </a>
            <a
              href="#"
              className="text-gray-700 hover:text-orange-600 transition-colors"
            >
              المميزات
            </a>
            <a
              href="#"
              className="text-gray-700 hover:text-orange-600 transition-colors"
            >
              المساعدة
            </a>
          </div>
          <div className="hidden md:flex items-center space-x-4">
            <button className="text-gray-700 hover:text-orange-600 transition-colors">
              تسجيل الدخول
            </button>
            <button className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-6 py-2 rounded-lg hover:from-orange-600 hover:to-red-600 transition-all duration-300 shadow-lg hover:shadow-xl">
              ابدأ مجاناً
            </button>
          </div>
          <button className="md:hidden p-2 rounded-md text-gray-700 hover:text-orange-600 hover:bg-gray-100 transition-colors">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              className="lucide lucide-menu w-6 h-6"
            >
              <line x1="4" x2="20" y1="12" y2="12"></line>
              <line x1="4" x2="20" y1="6" y2="6"></line>
              <line x1="4" x2="20" y1="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
}
