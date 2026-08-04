import React from "react";
import { useProfile } from "../hooks/useProfile";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import toast from "react-hot-toast";
import { useUserSubscription } from "../hooks/useSubscriptions";

// Component for protecting the subscription-cancelled page
export function ProtectedCancelledRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const {
    user: userData,
    loading: profileLoading,
    error: profileError,
  } = useProfile();

  // Check if user is authenticated (can fetch profile successfully)
  const isAuthenticated = !!userData;

  // Check if user has a shop
  const hasShop = !!userData?.shop;

  // Use the new subscription logic from useUserSubscription hook
  const { hasExpiredSubscription } = useUserSubscription();

  useEffect(() => {
    // If not loading and not authenticated, redirect to login
    if (!profileLoading && !isAuthenticated) {
      toast.error("Please log in to access this page");
      navigate("/auth", { replace: true });
      return;
    }

    // If not loading, authenticated, but no shop, redirect to create shop
    if (
      !profileLoading &&
      isAuthenticated &&
      userData.role.name !== "admin" &&
      !hasShop
    ) {
      toast.error("Please complete your shop setup first");
      navigate("/auth/create-shop", { replace: true });
      return;
    }

    // If not loading, authenticated, has shop, but no expired subscription, redirect to dashboard
    if (
      !profileLoading &&
      isAuthenticated &&
      hasShop &&
      !hasExpiredSubscription
    ) {
      navigate("/dashboard/overview", { replace: true });
      return;
    }
  }, [
    profileLoading,
    isAuthenticated,
    hasShop,
    hasExpiredSubscription,
    navigate,
    userData?.role.name,
  ]);

  // Show loading state
  if (profileLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show error state (this includes authentication errors)
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

  // If not authenticated, no shop, or no expired subscription, don't render children (will redirect)
  if (!isAuthenticated || !hasShop || !hasExpiredSubscription) {
    return null;
  }

  // If authenticated, has shop, and has cancelled subscription, render children
  return <>{children}</>;
}

export default function ProtectedDashboardRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const {
    user: userData,
    loading: profileLoading,
    error: profileError,
  } = useProfile();

  // Check if user is authenticated (can fetch profile successfully)
  const isAuthenticated = !!userData;

  // Check if user has a shop
  const hasShop = !!userData?.shop;

  // Use the new subscription logic from useUserSubscription hook
  const {
    hasValidSubscription,
    hasPendingSubscription,
    hasExpiredSubscription,
  } = useUserSubscription();

  useEffect(() => {
    // If not loading and not authenticated, redirect to login
    if (!profileLoading && !isAuthenticated) {
      navigate("/auth", { replace: true });
      return;
    }

    if (!profileLoading && isAuthenticated && userData.role.name === "admin") {
      navigate("/admin-dashboard/overview", { replace: true });
      return;
    }

    // If not loading, authenticated, but no shop, redirect to create shop
    if (
      !profileLoading &&
      isAuthenticated &&
      userData.role.name !== "admin" &&
      !hasShop
    ) {
      toast.error("Please complete your shop setup first");
      navigate("/auth/create-shop", { replace: true });
      return;
    }

    // If not loading, authenticated, has shop, but subscription is expired (cancelled and period ended), redirect to cancelled page
    if (
      !profileLoading &&
      isAuthenticated &&
      hasShop &&
      hasExpiredSubscription
    ) {
      toast.error("Your subscription has expired");
      navigate("/dashboard/subscription-cancelled", { replace: true });
      return;
    }

    // If not loading, authenticated, has shop, but no valid subscription, redirect to subscription
    if (
      !profileLoading &&
      isAuthenticated &&
      hasShop &&
      !hasValidSubscription &&
      !hasExpiredSubscription &&
      !hasPendingSubscription
    ) {
      toast.error("Subscription required to access dashboard");
      navigate("/auth/subscribe", { replace: true });
      return;
    }

    // If not loading, authenticated, has shop, but has pending subscription, redirect to subscription form
    if (
      !profileLoading &&
      isAuthenticated &&
      hasShop &&
      hasPendingSubscription
    ) {
      toast.error("Please complete your subscription setup");
      navigate("/auth/subscribe", { replace: true });
      return;
    }
  }, [
    profileLoading,
    isAuthenticated,
    hasShop,
    hasValidSubscription,
    hasExpiredSubscription,
    hasPendingSubscription,
    navigate,
    userData?.role?.name,
  ]);

  // Show loading state
  if (profileLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // Show error state (this includes authentication errors)
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

  // If not authenticated, no shop, or no valid subscription (but allow cancelled subscription page), don't render children (will redirect)
  if (!isAuthenticated || !hasShop || !hasValidSubscription) {
    return null;
  }

  // Admins are redirected to /admin-dashboard/overview by the effect above.
  if (isAuthenticated && userData.role.name === "admin") {
    return null;
  }

  // If authenticated, has shop, and has valid subscription, render children
  return <>{children}</>;
}
