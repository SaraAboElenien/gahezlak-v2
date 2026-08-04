import {
  Check,
  Star,
  Zap,
  Gift,
  Clock,
  AlertCircle,
  CheckCircleIcon,
  CircleDollarSign,
} from "lucide-react";
import {
  useUserSubscription,
  useCancelSubscription,
  TRIAL_PERIOD_DAYS,
} from "../../../hooks/useSubscriptions";

import toast from "react-hot-toast";
import Swal from "sweetalert2";
import { useTranslation } from "react-i18next";
import { useProfile } from "../../../hooks/useProfile";
import { useQueryClient } from "@tanstack/react-query";

export default function Subscription() {
  const { t } = useTranslation();
  const { data: subscriptionData, isLoading, error } = useUserSubscription();
  const cancelSubscriptionMutation = useCancelSubscription();
  const { refreshProfile } = useProfile();
  const queryClient = useQueryClient();

  const handleCancelSubscription = async () => {
    // Show SweetAlert confirmation dialog
    const result = await Swal.fire({
      title: t("landing.subscription.cancelSubscription.title"),
      text: t("landing.subscription.cancelSubscription.text"),
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444", // red-500
      cancelButtonColor: "#6b7280", // gray-500
      confirmButtonText: t("landing.subscription.cancelSubscription.confirm"),
      cancelButtonText: t("landing.subscription.cancelSubscription.cancel"),
      reverseButtons: true,
      customClass: {
        popup: "rounded-lg",
        confirmButton: "rounded-lg",
        cancelButton: "rounded-lg",
      },
    });

    if (!result.isConfirmed) {
      return;
    }

    try {
      await cancelSubscriptionMutation.mutateAsync();

      // Small delay to ensure backend has processed the cancellation
      // await new Promise((resolve) => setTimeout(resolve, 500));

      // Refresh user profile to get updated subscription status
      await refreshProfile();

      // Also invalidate and refetch profile queries to ensure UI updates
      await queryClient.refetchQueries({ queryKey: ["profile"] });

      // Show success message
      toast.success(t("landing.subscription.cancelSubscription.success"));

      // Stay on current page - the UI will update automatically
      // The subscription status will now show as cancelled but with access until period end
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("landing.subscription.cancelSubscription.error"),
      );
    }
  };

  // Early return if loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 lg:p-6 shadow-lg rounded-2xl">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-lg text-gray-600">
                {t("landing.subscription.loading")}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Early return if error
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 lg:p-6 shadow-lg rounded-2xl">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <p className="text-lg text-gray-600">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // if subscriptionData is null, render nothing (should not happen due to protected route)
  if (!subscriptionData) return null;

  const { plan, status, isInTrial, daysRemaining, totalDays, periodEnd } =
    subscriptionData;

  // Helper for subscription status
  const getSubscriptionStatus = () => {
    if (status === "trialing" && isInTrial) {
      if (daysRemaining <= 0) {
        return {
          color: "from-red-500 to-red-600",
          bgColor: "bg-red-50",
          textColor: "text-red-700",
          icon: AlertCircle,
          message: t("landing.subscription.status.trialExpired"),
        };
      } else if (daysRemaining <= 3) {
        return {
          color: "from-amber-500 to-amber-600",
          bgColor: "bg-amber-50",
          textColor: "text-amber-700",
          icon: Clock,
          message: `${daysRemaining} ${t(
            "landing.subscription.status.daysLeftInTrial",
          )}`,
        };
      } else {
        return {
          color: "from-green-500 to-green-600",
          bgColor: "bg-green-50",
          textColor: "text-green-700",
          icon: Clock,
          message: `${daysRemaining} ${t(
            "landing.subscription.status.daysLeftInTrial",
          )}`,
        };
      }
    } else if (status === "active") {
      return {
        color: "from-green-500 to-green-600",
        bgColor: "bg-green-50",
        textColor: "text-green-700",
        icon: CheckCircleIcon,
        message: `${t("landing.subscription.status.nextPayment")} ${formatDate(
          periodEnd,
        )}`,
      };
    } else if (status === "cancelled" || status === "CANCELLED") {
      // Check if subscription is cancelled but still within paid period
      if (daysRemaining > 0) {
        return {
          color: "from-amber-500 to-amber-600",
          bgColor: "bg-amber-50",
          textColor: "text-amber-700",
          icon: AlertCircle,
          message: `${t("landing.subscription.cancelled.title")} - ${t(
            "landing.subscription.cancelled.accessUntil",
          )} ${formatDate(periodEnd)}`,
        };
      } else {
        return {
          color: "from-red-500 to-red-600",
          bgColor: "bg-red-50",
          textColor: "text-red-700",
          icon: AlertCircle,
          message: t("landing.subscription.status.subscriptionExpired"),
        };
      }
    } else {
      return {
        color: "from-gray-500 to-gray-600",
        bgColor: "bg-gray-50",
        textColor: "text-gray-700",
        icon: Clock,
        message: `${daysRemaining} ${t(
          "landing.subscription.status.daysRemaining",
        )}`,
      };
    }
  };

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  const subscriptionStatus = getSubscriptionStatus();
  const StatusIcon = subscriptionStatus.icon;

  // Helper for current plan label
  const getCurrentPlanLabel = () => {
    if (status === "active") return plan.planGroup;
    if (status === "trialing" && isInTrial)
      return t("landing.subscription.trial.freeTrial");
    if (status === "cancelled" || status === "CANCELLED") {
      return `${t("landing.subscription.cancelled.title")} - ${plan.planGroup}`;
    }
    return plan.planGroup;
  };

  // Helper for plan status text
  const getPlanStatusText = () => {
    if (status === "active") {
      return `${t("landing.subscription.status.nextPayment")} ${formatDate(
        periodEnd,
      )}`;
    }
    if (status === "trialing" && isInTrial) {
      return `${daysRemaining} ${t(
        "landing.subscription.status.daysRemaining",
      )}`;
    }
    if (status === "cancelled" || status === "CANCELLED") {
      if (daysRemaining > 0) {
        return `${t("landing.subscription.cancelled.accessUntil")} ${formatDate(
          periodEnd,
        )}`;
      } else {
        return t("landing.subscription.cancelled.subscriptionCancelled");
      }
    }
    return `${daysRemaining} ${t("landing.subscription.status.daysRemaining")}`;
  };

  // Helper for progress bar
  const getProgress = () => {
    if (status === "trialing" && isInTrial) {
      // For trial: show progress as days elapsed out of 7 days
      const elapsedDays = TRIAL_PERIOD_DAYS - daysRemaining;
      return Math.min(
        100,
        Math.max(0, (elapsedDays / TRIAL_PERIOD_DAYS) * 100),
      );
    } else if (status === "active") {
      // For active subscription: show progress as days used in current period
      const usedDays = totalDays - daysRemaining;
      return Math.min(100, Math.max(0, (usedDays / totalDays) * 100));
    }
    return 0;
  };

  // Helper for progress bar color
  const getProgressBarColor = () => {
    if (status === "active") {
      return "bg-green-500";
    } else if (status === "trialing" && isInTrial) {
      if (daysRemaining <= 0) {
        return "bg-red-500"; // Expired
      } else if (daysRemaining <= 1) {
        return "bg-red-500"; // Last day
      } else if (daysRemaining <= 3) {
        return "bg-amber-500"; // Warning (3 days or less)
      } else {
        return "bg-gradient-to-r from-blue-500 to-blue-600"; // Normal
      }
    }
    return "bg-gray-500";
  };

  // Helper for CTA button
  // const renderCTAButton = () => {
  //   if (status === "active") {
  //     return (
  //       <button
  //         className="w-full text-base lg:text-lg py-4 lg:py-5 rounded-xl font-bold shadow-lg bg-gradient-to-r from-green-500 to-green-600 text-white opacity-80 cursor-not-allowed"
  //         disabled
  //       >
  //         You are Subscribed
  //       </button>
  //     );
  //   }
  //   if (status === "trialing" && isInTrial) {
  //     return (
  //       <button
  //         className="w-full text-base lg:text-lg py-4 lg:py-5 rounded-xl font-bold shadow-lg bg-gradient-to-r from-blue-500 to-blue-600 text-white cursor-not-allowed"
  //         disabled
  //       >
  //         Trial Active
  //       </button>
  //     );
  //   }
  //   return (
  //     <button
  //       className="w-full text-base lg:text-lg py-4 lg:py-5 rounded-xl font-bold shadow-lg bg-gradient-to-r from-gray-500 to-gray-600 text-white opacity-80 cursor-not-allowed"
  //       disabled
  //     >
  //       {status}
  //     </button>
  //   );
  // };

  // Helper for cancel button
  const renderCancelButton = () => {
    // Don't show cancel button for already cancelled subscriptions
    if (status === "cancelled" || status === "CANCELLED") {
      return null;
    }

    if (status === "active" || (status === "trialing" && isInTrial)) {
      return (
        <button
          onClick={handleCancelSubscription}
          disabled={cancelSubscriptionMutation.isPending}
          className="w-full mt-0.5 cursor-pointer text-base lg:text-lg py-3 lg:py-4 rounded-xl font-bold shadow-lg bg-gradient-to-r from-red-500 to-red-600 text-white hover:shadow-xl transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
        >
          {cancelSubscriptionMutation.isPending ? (
            <div className="flex items-center justify-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              {t("landing.subscription.cancelSubscription.cancelling")}
            </div>
          ) : (
            t("landing.subscription.cancelSubscription.button")
          )}
        </button>
      );
    }
    return null;
  };

  // Helper for top badge
  const renderTopBadge = () => {
    if (status === "active") {
      return (
        <div className="bg-gradient-to-r from-primary to-lighter-primary text-white px-6 py-2 rounded-full text-sm font-bold shadow-lg">
          {t("landing.subscription.active.welcome")}
        </div>
      );
    }
    if (status === "trialing" && isInTrial) {
      return (
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-2 rounded-full text-sm font-bold shadow-lg">
          {t("landing.subscription.trial.freeTrialActive")}
        </div>
      );
    }
    if (status === "cancelled" || status === "CANCELLED") {
      return (
        <div className="bg-gradient-to-r from-red-500 to-red-600 text-white px-6 py-2 rounded-full text-sm font-bold shadow-lg">
          <p>{t("landing.subscription.cancelled.subscriptionCancelled")}</p>
        </div>
      );
    }
    return (
      <div className="bg-gradient-to-r from-gray-500 to-gray-600 text-white px-6 py-2 rounded-full text-sm font-bold shadow-lg">
        {status}
      </div>
    );
  };

  // Helper for after-trial section
  const renderAfterTrialSection = () => {
    if (status === "active") {
      return (
        <div className="mt-12 bg-white rounded-2xl p-6 lg:p-8 shadow-sm border border-gray-200 text-center">
          <h3 className="text-xl font-semibold mb-6 text-gray-900">
            {t("landing.subscription.active.thankYou")}
          </h3>
          <div className="flex flex-col items-center gap-4">
            <CheckCircleIcon className="h-10 w-10 text-green-600 mb-2" />
            <p className="text-lg text-green-700 font-semibold">
              {t("landing.subscription.active.fullAccess")}
            </p>
            <p className="text-gray-600">
              {t("landing.subscription.active.nextPaymentDue")}{" "}
              {formatDate(periodEnd)}.
            </p>
            <p className="text-gray-500 text-sm mt-2">
              {t("landing.subscription.active.needHelp")}
            </p>
          </div>
        </div>
      );
    }
    if (status === "trialing" && isInTrial) {
      return (
        <div className="mt-12 bg-white rounded-2xl p-6 lg:p-8 shadow-sm border border-gray-200">
          <h3 className="text-xl font-semibold mb-6 text-gray-900 text-center">
            {t("landing.subscription.trial.freeTrial")}
          </h3>
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Clock className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900 mb-1">
                  {t("landing.subscription.active.trialPeriod")}
                </h4>
                <p className="text-sm text-gray-600">
                  {daysRemaining}{" "}
                  {t("landing.subscription.active.trialPeriodText")}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <CheckCircleIcon className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900 mb-1">
                  {t("landing.subscription.active.fullAccessTitle")}
                </h4>
                <p className="text-sm text-gray-600">
                  {t("landing.subscription.active.fullAccessText")}
                </p>
              </div>
            </div>
          </div>
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700 text-center">
              {t("landing.subscription.active.autoConvertText")}{" "}
              {formatDate(periodEnd)}.{" "}
              {t("landing.subscription.active.completeAutoConvertText")}
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 lg:p-6 shadow-lg rounded-2xl">
      <div className="max-w-7xl mx-auto">
        {/* Header with subscription status */}
        <div className="mb-8">
          {/* Hero Header */}
          <div className="bg-white dark:bg-card shadow-sm border-b border-gray-200 dark:border-gray-700">
            <div className="max-w-7xl mx-auto px-6 py-8">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                {/* Title Section */}
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-primary to-darker-primary rounded-2xl flex items-center justify-center shadow-lg">
                    <CircleDollarSign className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
                      {t("subscription")}
                    </h1>
                    <p className="text-lg text-gray-600 dark:text-gray-300">
                      {t("landing.subscription.subtitle")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mb-4 mt-6">
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-full ${subscriptionStatus.bgColor}`}
            >
              <StatusIcon
                className={`h-4 w-4 ${subscriptionStatus.textColor}`}
              />
              <span
                className={`text-sm font-medium ${subscriptionStatus.textColor}`}
              >
                {subscriptionStatus.message}
              </span>
            </div>
          </div>

          {/* Status alerts */}
          {/* Removed cancelled status alert as it's no longer needed */}

          {/* Trial ending warning */}
          {status === "trialing" && isInTrial && daysRemaining <= 1 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-red-800">
                    {daysRemaining === 0
                      ? t("landing.subscription.trial.trialEnded")
                      : t("landing.subscription.trial.trialEndsTomorrow")}
                  </h3>
                  <p className="text-red-700 text-sm">
                    {daysRemaining === 0
                      ? t("landing.subscription.trial.trialEndedText")
                      : t("landing.subscription.trial.trialEndsTomorrowText")}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Main pricing section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Current Plan Status */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold mb-4 text-gray-900">
                {t("landing.subscription.currentPlan")}
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                    <Gift className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {getCurrentPlanLabel()}
                    </p>
                    <p className="text-sm text-gray-500">
                      {getPlanStatusText()}
                    </p>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-600">
                      {status === "trialing" && isInTrial
                        ? t("landing.subscription.progress.trialProgress")
                        : t(
                            "landing.subscription.progress.subscriptionProgress",
                          )}
                    </span>
                    <span className="text-sm font-medium text-gray-900">
                      {status === "trialing" && isInTrial
                        ? `${Math.max(
                            0,
                            TRIAL_PERIOD_DAYS - daysRemaining,
                          )}/${TRIAL_PERIOD_DAYS} ${t(
                            "landing.subscription.progress.days",
                          )}`
                        : `${Math.max(
                            0,
                            totalDays - daysRemaining,
                          )}/${totalDays} ${t(
                            "landing.subscription.progress.days",
                          )}`}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${getProgressBarColor()}`}
                      style={{
                        width: `${getProgress()}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Trust indicators */}
            {/* <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold mb-4 text-gray-900">
                Why Upgrade?
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span className="text-sm text-gray-700">
                    Free technical support
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span className="text-sm text-gray-700">
                    Continuous updates
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span className="text-sm text-gray-700">
                    Data security guaranteed
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span className="text-sm text-gray-700">Cancel anytime</span>
                </div>
              </div>
            </div> */}

            {/* Bottom section - After trial or subscription status */}
            {renderAfterTrialSection()}
          </div>

          {/* Right Column - Pricing Card */}
          <div className="lg:col-span-2">
            <div className="relative">
              {/* Upgrade badge */}
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 z-10">
                {renderTopBadge()}
              </div>

              <div className="bg-white rounded-2xl shadow-lg border-2 border-green-200 overflow-hidden">
                <div className="bg-gradient-to-br from-white to-green-50 px-6 lg:px-8 pt-10 pb-6">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2 mb-4">
                      <h2 className="text-2xl lg:text-3xl font-bold text-gray-900">
                        {plan.planGroup}
                      </h2>
                    </div>

                    {/* Price display */}
                    <div className="mb-4">
                      <div className="flex items-baseline justify-center gap-1">
                        <span className="text-4xl lg:text-5xl font-bold text-primary mx-2">
                          {plan.price}
                        </span>
                        <div className="flex flex-col items-start">
                          <span className="text-gray-600 text-lg">
                            {plan.currency}/{plan.frequency}
                          </span>
                        </div>
                      </div>
                    </div>

                    <p className="text-gray-600 text-base lg:text-md max-w-md mx-auto mb-6">
                      {plan.description}
                    </p>

                    {/* Highlights */}
                    <div className="flex flex-wrap justify-center gap-6 pt-6 border-t border-gray-200">
                      <div className="flex items-center gap-2">
                        <Star className="h-4 w-4 text-green-600" />
                        <span className="text-sm text-gray-700">
                          {t("landing.subscription.highlights.mostLoved")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-green-600" />
                        <span className="text-sm text-gray-700">
                          {t("landing.subscription.highlights.quickSetup")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Gift className="h-4 w-4 text-green-600" />
                        <span className="text-sm text-gray-700">
                          {t("landing.subscription.highlights.noSetupFees")}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-6 lg:px-8 pb-8 py-4 mt-2">
                  {/* Features grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
                    {plan.features.map((feature: string, index: number) => (
                      <div key={index} className="flex items-center gap-3">
                        <div className="bg-green-100 rounded-full p-1 flex-shrink-0">
                          <Check className="h-3 w-3 text-green-600" />
                        </div>
                        <span className="text-sm font-medium text-gray-700">
                          {feature}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* CTA Button */}
                  <div className="space-y-4">
                    {/* {renderCTAButton()} */}
                    {renderCancelButton()}
                    <div className="text-center">
                      <p className="text-sm text-gray-500">
                        {status === "active"
                          ? t("landing.subscription.footer.active")
                          : status === "trialing" && isInTrial
                            ? t("landing.subscription.footer.trial")
                            : t("landing.subscription.footer.default")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
