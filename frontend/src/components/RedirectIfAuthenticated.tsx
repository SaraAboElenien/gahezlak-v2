import React from "react";
import { useProfile } from "../hooks/useProfile";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import toast from "react-hot-toast";
import { useUserSubscription } from "../hooks/useSubscriptions";
import { useTranslation } from "react-i18next";
import PageLoading from "./PageLoading";

export default function RedirectIfAuthenticated({
  children,
}: {
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user: userData, loading: isLoading } = useProfile();

  // Check if user is authenticated (can fetch profile successfully)
  const isAuthenticated = !!userData;

  // Check if user has a shop
  const hasShop = !!userData?.shop;

  // Use the new subscription logic from useUserSubscription hook
  const { hasValidSubscription } = useUserSubscription();

  useEffect(() => {
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
    // If not loading and authenticated, redirect to appropriate page
    if (!isLoading && isAuthenticated && userData.role.name !== "admin") {
      if (hasValidSubscription) {
        // User has everything, redirect to dashboard
        navigate("/dashboard/overview", { replace: true });
      } else if (hasShop) {
        // User has shop but no subscription, redirect to subscription
        toast("Please complete your subscription to continue.", {
          duration: 3000,
          icon: "ℹ️",
        });
        navigate("/auth/subscribe", { replace: true });
      } else {
        // User is authenticated but no shop, redirect to create shop
        toast("Please complete your shop setup to continue.", {
          duration: 3000,
          icon: "ℹ️",
        });
        navigate("/auth/create-shop", { replace: true });
      }
    }
  }, [
    isLoading,
    isAuthenticated,
    hasShop,
    hasValidSubscription,
    navigate,
    userData,
  ]);

  // Show loading while checking. This is the login/landing entry point, and
  // the profile bootstrap behind it is usually the first API call a visitor
  // makes — so it is the one most likely to hit a sleeping backend. PageLoading
  // escalates to the cold-start explanation on its own once that happens.
  if (isLoading) {
    return (
      <PageLoading
        className="w-full"
        label={t("common.checkingAuthentication")}
      />
    );
  }

  // If authenticated, show message and don't render children (will redirect)
  if (isAuthenticated) {
    return null;
  }

  // If not authenticated, show the auth form
  return <>{children}</>;
}
