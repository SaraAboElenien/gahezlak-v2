import {
  Users,
  LayoutDashboard,
  CircleDollarSign,
  ShoppingBag,
  MessageSquareMore,
} from "lucide-react";
import Sidebar, { type SidebarMenuItem } from "./Sidebar";

interface AdminDashboardSidebarProps {
  onClose?: () => void;
  isOpen?: boolean;
}

const items: SidebarMenuItem[] = [
  { title: "overview", to: "overview", icon: <LayoutDashboard /> },
  { title: "users", to: "users", icon: <Users /> },
  { title: "Reports", to: "AdminReports", icon: <MessageSquareMore /> },
  { title: "shops", to: "shops", icon: <ShoppingBag /> },
  { title: "subscription", to: "subscription", icon: <CircleDollarSign /> },
];

export default function AdminDashboardSidebar({
  onClose,
  isOpen = true,
}: AdminDashboardSidebarProps) {
  return (
    <Sidebar
      title="dashboard"
      items={items}
      onClose={onClose}
      isOpen={isOpen}
    />
  );
}
