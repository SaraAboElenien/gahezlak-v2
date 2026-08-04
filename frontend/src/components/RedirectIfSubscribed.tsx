import React from "react";
import { useProfile } from "../hooks/useProfile";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useUserSubscription } from "../hooks/useSubscriptions";
import toast from "react-hot-toast";

export default function RedirectIfSubscribed({
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

  // Use the new subscription logic from useUserSubscription hook
  const { hasValidSubscription, hasPendingSubscription } =
    useUserSubscription();

  useEffect(() => {
    // If not loading and not authenticated, redirect to login
    if (!isLoading && !isAuthenticated) {
      toast.error("Please log in to access the subscription form");
      navigate("/auth", { replace: true });
      return;
    }

    // admins
    if (!isLoading && userData?.role.name === "admin") {
      navigate("/admin-dashboard/overview", { replace: true });
      return;
    }
    //  if staff
    if (
      (!isLoading &&
        hasValidSubscription &&
        userData?.role.name === "kitchen") ||
      userData?.role.name === "shop_staff"
    ) {
      navigate("/dashboard/orders", { replace: true });
      return;
    }

    // Only redirect if not loading and user has valid subscription
    if (!isLoading && hasValidSubscription) {
      toast.success(
        "You already have an active subscription! Redirecting to dashboard.",
        {
          duration: 2000,
        },
      );
      navigate("/dashboard/overview", { replace: true });
    }

    // If user has pending subscription, redirect to subscription form
    if (!isLoading && hasPendingSubscription) {
      toast.error("Please complete your subscription setup first.");
      navigate("/auth/subscribe", { replace: true });
    }
  }, [
    isLoading,
    isAuthenticated,
    hasValidSubscription,
    hasPendingSubscription,
    navigate,
    userData?.role.name,
  ]);

  // Show loading or children while checking
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Checking subscription status...</p>
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

  // If subscribed, don't render children (will redirect)
  if (hasValidSubscription) {
    return null;
  }

  // If not subscribed, show the subscription form
  return <>{children}</>;
}
