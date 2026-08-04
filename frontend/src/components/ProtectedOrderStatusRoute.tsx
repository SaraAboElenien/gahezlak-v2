import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getOrderByNumber } from "@/services/OrderApi";
import toast from "react-hot-toast";
import { useLang } from "@/hooks/useLang";
import { useTranslation } from "react-i18next";
import { useOrderValidation } from "@/hooks/useOrderValidation";

interface ProtectedOrderStatusRouteProps {
  children: React.ReactNode;
}

export default function ProtectedOrderStatusRoute({
  children,
}: ProtectedOrderStatusRouteProps) {
  const navigate = useNavigate();
  const { slug, orderNumber: urlOrderNumber } = useParams(); // Get orderNumber from URL
  const { currentLang } = useLang();
  const { t } = useTranslation();
  const [orderNumber, setOrderNumber] = useState<string>("");

  // Use the order validation hook
  const { validateOrder } = useOrderValidation({
    slug: slug || "",
    redirectOnInvalid: false, // We'll handle redirects manually
  });

  // Get order number from URL and validate timestamp
  useEffect(() => {
    if (urlOrderNumber) {
      const validation = validateOrder();

      if (!validation.isValid) {
        // Order is invalid, redirect to menu
        toast.error(t("publicMenu.noOrderFound"));
        navigate(`/shops/${slug}/menu`, { replace: true });
        return;
      }

      // Order is valid, set the order number
      setOrderNumber(urlOrderNumber);
    } else {
      // No order number in URL, redirect to menu
      toast.error(t("publicMenu.noOrderFound"));
      navigate(`/shops/${slug}/menu`, { replace: true });
    }
  }, [navigate, slug, currentLang, urlOrderNumber, validateOrder, t]);

  // Query order data to verify order exists
  const {
    data: orderData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["orderByNumber", orderNumber],
    queryFn: () => getOrderByNumber(orderNumber),
    enabled: !!orderNumber,
    retry: false, // Don't retry if order not found
  });

  useEffect(() => {
    if (!isLoading && orderNumber) {
      if (error) {
        // Order not found or other error
        toast.error(t("publicMenu.noOrderFound"));
        navigate(`/shops/${slug}/menu`, { replace: true });
        return;
      }

      // If order exists, allow access (no need to check orderStatus since it's not in API response)
      if (orderData?.data) {
        return; // Allow access
      }
    }
  }, [
    isLoading,
    error,
    orderData,
    orderNumber,
    navigate,
    slug,
    currentLang,
    t,
  ]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
          <p className="text-gray-600">
            {currentLang === "ar"
              ? "جاري التحقق من حالة الطلب..."
              : "Verifying order status..."}
          </p>
        </div>
      </div>
    );
  }

  // If no order number, don't render children (will redirect)
  if (!orderNumber) {
    return null;
  }

  // If order not found, don't render children (will redirect)
  if (error) {
    return null;
  }

  // If order exists, render the status page
  return <>{children}</>;
}
