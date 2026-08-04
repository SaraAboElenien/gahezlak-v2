import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  CheckCircle,
  ArrowLeft,
  Search,
  Menu,
  XCircle,
  Clock,
} from "lucide-react";
import { useLang } from "@/hooks/useLang";
import { useTranslation } from "react-i18next";
import { useCart } from "@/hooks/use-cart";

export default function OrderStatusPage() {
  const { slug, orderNumber: urlOrderNumber } = useParams();
  const navigate = useNavigate();
  const { currentLang } = useLang();
  const { t } = useTranslation();
  const { clearCart } = useCart();
  const [searchParams] = useSearchParams();
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);

  // Extract success parameter from URL (for Paymob redirects)
  const success = searchParams.get("success") === "true";

  // Check if this is a Paymob redirect (has success param) or cash payment (no success param)
  const isPaymobRedirect = searchParams.has("success");

  useEffect(() => {
    // Determine order number source and payment method
    if (isPaymobRedirect) {
      // Paymob redirect - get order number from URL path parameter
      if (urlOrderNumber) {
        setOrderNumber(urlOrderNumber);
        setPaymentMethod("CreditCard");

        // Store order number in localStorage for Track page
        localStorage.setItem("lastOrderNumber", urlOrderNumber);
        // Store timestamp for protected route validation
        localStorage.setItem("lastOrderTimestamp", Date.now().toString());
      }
    } else {
      // Cash payment - get order number from localStorage
      const storedOrderNumber = localStorage.getItem("lastOrderNumber");
      if (storedOrderNumber) {
        setOrderNumber(storedOrderNumber);
        setPaymentMethod("Cash");
      }
    }

    // Clear cart if payment was successful (Paymob) or order was created (cash)
    if (success || !isPaymobRedirect) {
      clearCart();
    }
  }, [urlOrderNumber, searchParams, success, isPaymobRedirect, clearCart]);

  const handleGoToMenu = () => {
    navigate(`/shops/${slug}/menu`);
  };

  const handleTrackOrder = () => {
    if (orderNumber) {
      navigate(`/shops/${slug}/track?orderNumber=${orderNumber}`);
    }
  };

  const handleBackToCart = () => {
    navigate(`/shops/${slug}/cart`);
  };

  // Determine status and message based on payment method and success state
  const getStatusInfo = () => {
    if (paymentMethod === "Cash") {
      return {
        success: true,
        icon: <Clock className="w-12 h-12 text-yellow-500" />,
        iconBg: "bg-yellow-100",
        title:
          currentLang === "ar"
            ? "الطلب معلق - يرجى الذهاب إلى الكاشير"
            : "Order is pending please go to cashier",
        showOrderNumber: true,
      };
    }

    if (paymentMethod === "CreditCard") {
      if (success) {
        return {
          success: true,
          icon: <CheckCircle className="w-12 h-12 text-green-500" />,
          iconBg: "bg-green-100",
          title: t("publicMenu.orderConfirmed"),
          showOrderNumber: true,
        };
      } else {
        return {
          success: false,
          icon: <XCircle className="w-12 h-12 text-red-500" />,
          iconBg: "bg-red-100",
          title:
            currentLang === "ar"
              ? "فشل الدفع، يرجى المحاولة مرة أخرى"
              : "Payment failed, please try again",
          showOrderNumber: false,
        };
      }
    }

    // Default case
    return {
      success: false,
      icon: <XCircle className="w-12 h-12 text-red-500" />,
      iconBg: "bg-red-100",
      title:
        currentLang === "ar"
          ? "حدث خطأ غير متوقع"
          : "An unexpected error occurred",
      showOrderNumber: false,
    };
  };

  const statusInfo = getStatusInfo();

  return (
    <div className="min-h-screen py-8 sm:py-12 md:py-16 lg:py-20 bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Status Card */}
        <div className="bg-white rounded-lg p-8 shadow-lg text-center">
          {/* Status Icon */}
          <div className="flex justify-center mb-6">
            <div
              className={`w-20 h-20 ${statusInfo.iconBg} rounded-full flex items-center justify-center`}
            >
              {statusInfo.icon}
            </div>
          </div>

          {/* Status Message */}
          <h1 className="text-3xl font-bold text-gray-800 mb-4">
            {statusInfo.title}
          </h1>

          {/* Order Number */}
          {orderNumber && statusInfo.showOrderNumber && (
            <div className="bg-gray-50 p-4 rounded-lg mb-8">
              <p className="text-sm text-gray-600 mb-2">
                {currentLang === "ar" ? "رقم الطلب:" : "Order Number:"}
              </p>
              <p className="text-xl font-bold text-gray-800">#{orderNumber}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4">
            {statusInfo.success ? (
              <>
                <button
                  onClick={handleGoToMenu}
                  className="cursor-pointer flex-1 flex items-center justify-center gap-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-200 transform hover:scale-105"
                >
                  <Menu className="w-5 h-5" />
                  {currentLang === "ar" ? "العودة إلى القائمة" : "Back to Menu"}
                </button>

                {orderNumber && (
                  <button
                    onClick={handleTrackOrder}
                    className="cursor-pointer flex-1 flex items-center justify-center gap-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-200 transform hover:scale-105"
                  >
                    <Search className="w-5 h-5" />
                    {currentLang === "ar" ? "تتبع الطلب" : "Track Order"}
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={handleBackToCart}
                  className="cursor-pointer flex-1 flex items-center justify-center gap-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-200 transform hover:scale-105"
                >
                  <ArrowLeft className="w-5 h-5" />
                  {currentLang === "ar" ? "العودة إلى السلة" : "Back to Cart"}
                </button>

                <button
                  onClick={handleGoToMenu}
                  className="cursor-pointer flex-1 flex items-center justify-center gap-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-200 transform hover:scale-105"
                >
                  <Menu className="w-5 h-5" />
                  {currentLang === "ar" ? "العودة إلى القائمة" : "Back to Menu"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
