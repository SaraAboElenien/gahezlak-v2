import { useState, type JSX } from "react";
import { Outlet } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
import AdminDashboardSidebar from "@/components/AdminDashboardSidebar";
import Seo from "@/components/Seo";

export default function AdminDashboardLayout(): JSX.Element {
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const { loading: isLoading } = useProfile();

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
      <Seo title="Admin Dashboard" noindex />
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

      <AdminDashboardSidebar onClose={handleCloseSidebar} />
    </div>
  );
}
