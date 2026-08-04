// import { useEffect } from "react";
// import { useNavigate } from "react-router-dom";
// import { useProfile } from "@/hooks/useProfile";

// export default function ProtectedRoute(children: React.ReactNode) {
//   const navigate = useNavigate();
//   const { user, loading } = useProfile();

//   useEffect(() => {
//     if (loading) return;
//     if (!user) {
//       navigate("/auth", { replace: true });
//       return;
//     }
//   }, [user, loading, navigate]);

//   if (loading) return null;
//   if (!user) return null;

//   return <>{children}</>;
// }

import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useProfile } from "@/hooks/useProfile";
import Loader from "./Loader";

const ADMIN_ROLE = "admin";
const OWNER_ROLES = ["shop_owner", "shop_manager"];
const STAFF_ROLES = ["shop_staff", "kitchen"];

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useProfile();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }
    const role = user.role?.name;
    if (
      role === ADMIN_ROLE &&
      !location.pathname.startsWith("/admin-dashboard")
    ) {
      navigate("/admin-dashboard/overview", { replace: true });
      return;
    }
    if (
      OWNER_ROLES.includes(role) &&
      !location.pathname.startsWith("/dashboard")
    ) {
      navigate("/dashboard/overview", { replace: true });
      return;
    }
    if (
      STAFF_ROLES.includes(role) &&
      location.pathname !== "/dashboard/orders"
    ) {
      navigate("/dashboard/orders", { replace: true });
      return;
    }
  }, [user, loading, navigate, location]);

  if (loading) return <Loader />;
  if (!user) return null;

  const role = user.role?.name;
  if (role === ADMIN_ROLE && location.pathname.startsWith("/admin-dashboard"))
    return <>{children}</>;
  if (OWNER_ROLES.includes(role) && location.pathname.startsWith("/dashboard"))
    return <>{children}</>;
  if (STAFF_ROLES.includes(role) && location.pathname === "/dashboard/orders")
    return <>{children}</>;
  return null;
}
