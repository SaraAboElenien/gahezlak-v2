import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useAdvertisedPlan } from "../../hooks/usePlans";
import { useCreateSubscription } from "../../hooks/useSubscriptions";
import { useProfile } from "../../hooks/useProfile";
import { ArrowLeft, Check, AlertCircle } from "lucide-react";

export default function SubscriptionForm() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Get plan data using the same hook as other components
  const {
    data: plan,
    isLoading: planLoading,
    error: planError,
  } = useAdvertisedPlan();

  // Use React Query mutation for subscription creation
  const createSubscriptionMutation = useCreateSubscription();

  // Get user data from useProfile hook
  const {
    user: userData,
    loading: profileLoading,
    handleLogout,
  } = useProfile();

  const logout = () => {
    handleLogout();
    handleLogout();
    setTimeout(() => {
      navigate("/auth");
      navigate("/auth");
    }, 500);
  };

  const handleSubscribe = async () => {
    if (!plan) return;

    // Check if user is logged in
    if (!userData) {
      toast.error(t("landing.subscriptionForm.userNotLoggedIn"));
      return;
    }

    // Check if user already has an active subscription
    if (userData.shop?.subscriptionId?.status === "active") {
      toast.error(t("landing.subscriptionForm.alreadySubscribed"));
      navigate("/dashboard/overview");
      return;
    }

    try {
      const planId = plan._id;
      const result = await createSubscriptionMutation.mutateAsync(planId);
      console.log("Subscription result:", result);

      // Check if we got the iframeUrl from Paymob
      if (result.data?.iframeUrl) {
        // Navigate to Paymob's payment page
        window.location.href = result.data.iframeUrl as string;
      } else {
        toast.error(result.message || t("landing.subscriptionForm.failed"));
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("landing.subscriptionForm.failed"),
      );
    }
  };

  const totalPrice = plan ? plan.price : 0;
  const loading = createSubscriptionMutation.isPending;

  // Loading state
  if (planLoading || profileLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">
            {t("landing.subscriptionForm.loading")}
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (planError || !plan) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600">{t("landing.subscriptionForm.error")}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
          >
            {t("landing.subscriptionForm.retry")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-4 lg:p-6 mb-5">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-3">
          <button
            onClick={logout}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 " />
            {t("landing.subscriptionForm.logout")}
          </button>
          <div className="flex items-center ">
            <img src="/qr-hand.png" width="30px" alt="logo" />
            <h2
              className="text-2xl md:text-3xl lg:text-3xl tracking-tight duration-300 ms-2"
              style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 200 }}
            >
              gahez
              <span style={{ fontWeight: 400, fontStyle: "italic" }}>lak</span>
            </h2>
          </div>
        </div>

        <div className="flex justify-center">
          {/* Centered Panel - Subscription Details */}
          <div className="bg-white rounded-lg p-4 sm:p-6 lg:p-8 shadow-sm max-w-2xl w-full">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">
              {t("landing.subscriptionForm.subscribeTo")} {plan.planGroup}
            </h2>

            {/* Price Display */}
            <div className="mb-6">
              <div className="text-3xl sm:text-4xl font-bold text-gray-900 break-words">
                {plan.currency} {totalPrice.toFixed(2)}
              </div>
              <div className="text-gray-600">
                {t("landing.subscriptionForm.perMonth")}
              </div>
            </div>

            {/* Cost Breakdown */}
            <div className="space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium text-gray-900">{plan.title}</div>
                  <div className="text-sm text-gray-500">
                    {t("landing.subscriptionForm.billedMonthly")}
                  </div>
                </div>
                <div className="font-medium text-gray-900">
                  {plan.currency} {plan.price.toFixed(2)}
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <div className="border-gray-200 pt-2">
                  <div className="flex justify-between items-center">
                    <div className="font-semibold text-gray-900">
                      {t("landing.subscriptionForm.totalDue")}
                    </div>
                    <div className="font-semibold text-gray-900">
                      {plan.currency} {totalPrice.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Features */}
            <div className="mt-8">
              <h3 className="font-medium text-gray-900 mb-4">
                {t("landing.subscriptionForm.whatsIncluded")}
              </h3>
              <ul className="space-y-2">
                {plan.features.map((feature, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2 text-sm text-gray-600"
                  >
                    <Check className="h-3 w-3 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className="break-words">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Subscribe Button */}
            <div className="mt-8">
              <button
                onClick={handleSubscribe}
                className={`btn btn-gradient border-0 text-white shadow-lg w-full py-3 sm:py-4 text-base sm:text-lg font-semibold ${
                  loading ? "opacity-75 cursor-not-allowed" : ""
                }`}
                disabled={loading}
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    {t("landing.subscriptionForm.processing")}
                  </div>
                ) : (
                  t("landing.subscriptionForm.subscribe")
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
