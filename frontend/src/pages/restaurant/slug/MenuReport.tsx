import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { User, Phone, MessageSquare, ListOrdered } from "lucide-react";
import { useParams } from "react-router-dom";
import { useContactShop } from "@/hooks/useReports";
import {
  createReviewSchema,
  type ReviewFormData,
} from "@/types/validations/shop/reviewFormSchema";
import { useLang } from "@/hooks/useLang";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";

interface MenuReportProps {
  orderNumber?: string;
}

export default function MenuReport({ orderNumber }: MenuReportProps) {
  const { currentLang } = useLang();
  const { t } = useTranslation();
  const { slug } = useParams();

  // Use the contact shop mutation hook
  const contactShopMutation = useContactShop(slug || "");

  // Create schema based on current language
  const reviewSchema = createReviewSchema(currentLang as "en" | "ar");

  // Review form
  const {
    register: registerReview,
    handleSubmit: handleSubmitReview,
    formState: { errors: reviewErrors },
    reset: resetReview,
    setValue: setValueReview,
  } = useForm<ReviewFormData>({
    resolver: zodResolver(reviewSchema),
  });

  // Set the order number in the review form when orderNumber prop changes
  useEffect(() => {
    if (orderNumber) {
      setValueReview("orderNumber", parseInt(orderNumber));
    }
  }, [orderNumber, setValueReview]);

  const onSubmitReview = async (data: ReviewFormData) => {
    if (!slug) {
      console.error("Shop slug not available");
      toast.error(
        currentLang === "ar"
          ? "بيانات المتجر غير متوفرة. يرجى المحاولة مرة أخرى."
          : "Shop data not available. Please try again.",
      );
      return;
    }

    try {
      // Convert orderNumber to string as expected by the API
      const reportData = {
        senderFirstName: `${data.firstName}`,
        senderLastName: `${data.lastName}`,
        orderNumber: data.orderNumber,
        phoneNumber: data.phone,
        message: data.message,
      };
      console.log("reportData:", reportData);

      const response = await contactShopMutation.mutateAsync(reportData);

      console.log("Review submitted successfully:", response);

      toast.success(t("publicMenu.reviewSubmittedSuccess"));

      // Reset form after successful submission
      resetReview();
    } catch (error: unknown) {
      console.error("Error submitting review:", error);
      toast.error(t("publicMenu.reviewSubmittedError"));
    }
  };

  return (
    <div className="mt-8">
      <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-800 mb-4 sm:mb-6">
        {t("publicMenu.reviews")}
      </h3>

      <form
        onSubmit={handleSubmitReview(onSubmitReview)}
        className="bg-gradient-to-br from-primary to-lighter-primary p-4 sm:p-6 md:p-8 text-white rounded-lg shadow-2xl"
      >
        <div className="space-y-6 sm:space-y-8">
          {/* Customer Information Section */}
          <div className="bg-gray-800/50 p-4 sm:p-6 rounded-lg border border-gray-700">
            <h3 className="text-lg sm:text-xl font-bold text-white mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3">
              <User className="h-4 w-4 sm:h-5 sm:w-5 text-green-400" />
              {t("publicMenu.customerInfo")}
            </h3>

            <div className="space-y-4 sm:space-y-5">
              <div>
                <label
                  htmlFor="firstName"
                  className="block text-sm font-medium text-gray-300 mb-2"
                >
                  {t("publicMenu.firstName")} *
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 transform -translate-y-1/2 z-20 pointer-events-none">
                    <User className="text-gray-400 w-4 h-4" />
                  </div>
                  <input
                    id="firstName"
                    type="text"
                    placeholder={t("publicMenu.firstName")}
                    className="w-full px-3 sm:px-4 py-2 sm:py-3 pl-10 sm:pl-12 bg-white text-gray-900 border border-gray-600 rounded-lg focus:outline-none focus:border-green-400 transition-colors text-sm sm:text-base"
                    {...registerReview("firstName")}
                  />
                </div>
                {reviewErrors.firstName && (
                  <span className="text-red-400 text-xs sm:text-sm block mt-1">
                    {reviewErrors.firstName.message}
                  </span>
                )}
              </div>

              <div>
                <label
                  htmlFor="lastName"
                  className="block text-sm font-medium text-gray-300 mb-2"
                >
                  {t("publicMenu.lastName")} *
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 transform -translate-y-1/2 z-20 pointer-events-none">
                    <User className="text-gray-400 w-4 h-4" />
                  </div>
                  <input
                    id="lastName"
                    type="text"
                    placeholder={t("publicMenu.lastName")}
                    className="w-full px-3 sm:px-4 py-2 sm:py-3 pl-10 sm:pl-12 bg-white text-gray-900 border border-gray-600 rounded-lg focus:outline-none focus:border-green-400 transition-colors text-sm sm:text-base"
                    {...registerReview("lastName")}
                  />
                </div>
                {reviewErrors.lastName && (
                  <span className="text-red-400 text-xs sm:text-sm block mt-1">
                    {reviewErrors.lastName.message}
                  </span>
                )}
              </div>

              <div>
                <label
                  htmlFor="phone"
                  className="block text-sm font-medium text-gray-300 mb-2"
                >
                  {t("publicMenu.phoneNumber")} *
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 transform -translate-y-1/2 z-20 pointer-events-none">
                    <Phone className="text-gray-400 w-4 h-4" />
                  </div>
                  <input
                    id="phone"
                    type="tel"
                    placeholder="01xxxxxxxxx"
                    className="w-full px-3 sm:px-4 py-2 sm:py-3 pl-10 sm:pl-12 bg-white text-gray-900 border border-gray-600 rounded-lg focus:outline-none focus:border-green-400 transition-colors text-sm sm:text-base"
                    {...registerReview("phone")}
                  />
                </div>
                {reviewErrors.phone && (
                  <span className="text-red-400 text-xs sm:text-sm block mt-1">
                    {reviewErrors.phone.message}
                  </span>
                )}
              </div>

              <div>
                <label
                  htmlFor="orderNumber"
                  className="block text-sm font-medium text-gray-300 mb-2"
                >
                  {t("publicMenu.orderNumber")} *
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 transform -translate-y-1/2 z-20 pointer-events-none">
                    <ListOrdered className="text-gray-400 w-4 h-4" />
                  </div>
                  <input
                    id="orderNumber"
                    type="number"
                    min={1}
                    placeholder={t("publicMenu.enterOrderNumber")}
                    className="w-full px-3 sm:px-4 py-2 sm:py-3 pl-10 sm:pl-12 bg-white text-gray-900 border border-gray-600 rounded-lg focus:outline-none focus:border-green-400 transition-colors text-sm sm:text-base"
                    {...registerReview("orderNumber", {
                      valueAsNumber: true,
                      min: 1,
                    })}
                  />
                </div>
                {reviewErrors.orderNumber && (
                  <span className="text-red-400 text-xs sm:text-sm block mt-1">
                    {reviewErrors.orderNumber.message}
                  </span>
                )}
              </div>

              <div>
                <label
                  htmlFor="message"
                  className="block text-sm font-medium text-gray-300 mb-2"
                >
                  {t("publicMenu.reviewMessage")} *
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-3 z-20 pointer-events-none">
                    <MessageSquare className="text-gray-400 w-4 h-4" />
                  </div>
                  <textarea
                    id="message"
                    placeholder={t("publicMenu.reviewMessagePlaceholder")}
                    className="w-full px-3 sm:px-4 py-2 sm:py-3 pl-10 sm:pl-12 bg-white text-gray-900 border border-gray-600 rounded-lg placeholder-gray-400 focus:outline-none focus:border-green-400 transition-colors resize-none text-sm sm:text-base"
                    rows={3}
                    {...registerReview("message")}
                  />
                </div>
                {reviewErrors.message && (
                  <span className="text-red-400 text-xs sm:text-sm block mt-1">
                    {reviewErrors.message.message}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-center">
            <button
              type="submit"
              disabled={contactShopMutation.isPending}
              className="w-full sm:w-auto font-bold py-2 sm:py-3 md:py-4 px-4 sm:px-6 md:px-8 rounded-lg transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2 sm:gap-3 cursor-pointer text-sm sm:text-base bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white"
            >
              {contactShopMutation.isPending
                ? t("publicMenu.submittingReview")
                : t("publicMenu.submitReview")}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
