import { useState, type JSX } from "react";
import DashboardSidebar from "../../components/DashboardSidebar";
import { Link, Outlet } from "react-router-dom";
import { ChefHat, Menu, X } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
import { useLang } from "@/hooks/useLang";
import Seo from "@/components/Seo";

export default function DashboardLayout(): JSX.Element {
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const { user: userData, loading: isLoading } = useProfile();
  const { currentLang } = useLang();

  if (isLoading) {
    return <></>;
  }

  const toggleSidebar = (): void => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleCloseSidebar = (): void => {
    setIsSidebarOpen(false);
  };

  return (
    <div className="drawer lg:drawer-open bg-gray-50">
      <Seo title="Dashboard" noindex />
      <input
        id="my-drawer-2"
        type="checkbox"
        className="drawer-toggle"
        checked={isSidebarOpen}
        onChange={toggleSidebar}
      />

      <div className="drawer-content flex flex-col">
        <div className="navbar bg-base-100 shadow-sm lg:hidden sticky top-0 z-50">
          <div className="flex-none">
            <button
              onClick={toggleSidebar}
              className="btn btn-square btn-ghost hover:bg-base-200 active:bg-base-300 transition-colors duration-200"
              aria-label={isSidebarOpen ? "Close menu" : "Open menu"}
              type="button"
            >
              {isSidebarOpen ? (
                <X className="h-5 w-5 transition-transform duration-200" />
              ) : (
                <Menu className="h-5 w-5 transition-transform duration-200" />
              )}
            </button>
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">Dashboard</h1>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-4">
          <Outlet />
        </div>
      </div>

      <DashboardSidebar onClose={handleCloseSidebar} />

      <div
        className={`fixed bottom-4 ${currentLang === "ar" ? "left-4" : "right-4"}  z-50 cursor-pointer `}
      >
        <Link
          target="_blank"
          to={`/shops/${userData?.shop?.name}/menu`}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-full shadow-lg hover:scale-105 hover:bg-primary/80 transition"
        >
          <ChefHat className="w-5 h-5" />
          <span className="font-medium">
            {" "}
            {currentLang === "ar" ? "اعرض القائمة" : "View Menu"}{" "}
          </span>
        </Link>
      </div>
    </div>
  );
}
