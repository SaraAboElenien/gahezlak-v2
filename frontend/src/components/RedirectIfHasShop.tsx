import React from "react";
import { useProfile } from "../hooks/useProfile";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import toast from "react-hot-toast";

export default function RedirectIfHasShop({
  children,
}: {
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const {
    user: userData,
    loading: isLoading,
    error: profileError,
  } = useProfile();

  // Check if user is authenticated (can fetch profile successfully)
  const isAuthenticated = !!userData;

  // Check if user has a shop
  const hasShop = !!userData?.shop;

  useEffect(() => {
    // If not loading and not authenticated, redirect to login
    if (!isLoading && !isAuthenticated) {
      navigate("/auth", { replace: true });
      return;
    }

    // admins
    if (!isLoading && isAuthenticated && userData?.role.name === "admin") {
      navigate("/admin-dashboard/overview", { replace: true });
      return;
    }
    //  if staff
    if (
      (!isLoading && isAuthenticated && userData?.role.name === "kitchen") ||
      userData?.role.name === "shop_staff"
    ) {
      navigate("/dashboard/orders", { replace: true });
      return;
    }

    // If not loading, authenticated, and has shop, redirect to dashboard
    if (!isLoading && isAuthenticated && hasShop) {
      toast.success("You already have a shop! Redirecting to dashboard.", {
        duration: 2000,
      });
      navigate("/dashboard/overview", { replace: true });
      return;
    }
  }, [isLoading, isAuthenticated, hasShop, navigate, userData]);

  // Show loading or children while checking
  if (isLoading) {
    return (
      <div className="w-full flex items-center justify-center py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Checking shop status...</p>
        </div>
      </div>
    );
  }

  // Show error state (authentication error)
  if (profileError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 mb-4">
            <svg
              className="h-12 w-12 mx-auto"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <p className="text-gray-600 mb-4">Authentication required</p>
          <button
            onClick={() => navigate("/auth")}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  // If user has shop, don't render children (will redirect)
  if (hasShop) {
    return null;
  }

  // If user doesn't have shop, show the create shop form
  return <>{children}</>;
}
