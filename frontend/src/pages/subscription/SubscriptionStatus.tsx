import Loader from "@/components/Loader";
import { useLang } from "@/hooks/useLang";
import { useUserSubscription } from "@/hooks/useSubscriptions";
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useProfile } from "@/hooks/useProfile";
export default function SubscriptionStatus() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentLang } = useLang();
  const { hasValidSubscription } = useUserSubscription();
  const { refreshProfile } = useProfile();
  const isSuccess = searchParams.get("success") === "true";
  useEffect(() => {
    if (isSuccess) {
      refreshProfile();
      const timer = setTimeout(() => {
        navigate("/dashboard/overview", { replace: true });
      }, 3000);

      return () => clearTimeout(timer);
    } else {
      // If not success, redirect to appropriate page
      if (hasValidSubscription) {
        navigate("/dashboard/overview", { replace: true });
      } else {
        navigate("/auth/subscribe", { replace: true });
      }
    }
  }, [isSuccess, hasValidSubscription, navigate, refreshProfile]);

  if (!isSuccess) {
    return (
      <>
        <Loader />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="text-green-500 mb-4">
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
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          {currentLang === "en" ? "Payment Successful!" : "تم الدفع بنجاح!"}
        </h2>
        <p className="text-gray-600">
          {currentLang === "en"
            ? "You will be redirected shortly..."
            : "سيتم توجيهك قريباً..."}
        </p>
      </div>
    </div>
  );
}
