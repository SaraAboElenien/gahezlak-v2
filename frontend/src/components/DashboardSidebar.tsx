import {
  Logs,
  Settings,
  SquareMenu,
  Users,
  LayoutDashboard,
  CircleDollarSign,
  ChartColumn,
  MessageSquareMore,
} from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
import Sidebar, { type SidebarMenuItem } from "./Sidebar";

interface DashboardSidebarProps {
  onClose?: () => void;
  isOpen?: boolean;
}

const ownerManagerItems: SidebarMenuItem[] = [
  { title: "overview", to: "overview", icon: <LayoutDashboard /> },
  { title: "analytics", to: "analytics", icon: <ChartColumn /> },
  { title: "Menu", to: "menu", icon: <SquareMenu /> },
  { title: "orders", to: "orders", icon: <Logs /> },
  { title: "reports", to: "Reports", icon: <MessageSquareMore /> },
  { title: "subscription", to: "subscription", icon: <CircleDollarSign /> },
  { title: "staff", to: "staff", icon: <Users /> },
  { title: "settings.title", to: "settings", icon: <Settings /> },
];

// Staff/kitchen roles only get the orders link.
const staffItems: SidebarMenuItem[] = [
  { title: "orders", to: "orders", icon: <Logs /> },
];

export default function DashboardSidebar({
  onClose,
  isOpen = true,
}: DashboardSidebarProps) {
  const { user } = useProfile();
  const items =
    user?.role.name === "shop_owner" || user?.role.name === "shop_manager"
      ? ownerManagerItems
      : staffItems;

  return (
    <Sidebar
      title="dashboard"
      items={items}
      onClose={onClose}
      isOpen={isOpen}
    />
  );
}
