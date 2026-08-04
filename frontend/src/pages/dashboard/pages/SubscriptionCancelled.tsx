import { useNavigate } from "react-router-dom";
import { AlertCircle, LogOut, CreditCard, Home } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useSignout } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { clearAccessToken } from "@/services/axiosInint";

export default function SubscriptionCancelled() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { mutate: signout, isPending: isLoggingOut } = useSignout();
  const { setUser } = useProfile();

  // Clearing client-side state is no longer enough to log anyone out: the
  // session lives in an httpOnly refresh cookie only the server can delete,
  // so this has to go through the real signout endpoint.
  const handleLogout = () => {
    signout(undefined, {
      // onSettled, not onSuccess: whether or not the call succeeded, the user
      // asked to leave — drop the local session and send them home either way.
      onSettled: () => {
        clearAccessToken();
        setUser(null);
        toast.success(t("landing.subscriptionCancelled.logoutSuccess"));
        navigate("/");
      },
    });
  };

  const handleResubscribe = () => {
    navigate("/auth/subscribe");
  };

  const handleGoHome = () => {
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 text-center">
          <div className="mb-6">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {t("landing.subscriptionCancelled.title")}
            </h2>
            <p className="text-gray-600 mb-6">
              {t("landing.subscriptionCancelled.description")}
            </p>
          </div>

          <div className="space-y-4">
            <button
              onClick={handleResubscribe}
              className="w-full btn-gradient border-0 text-white shadow-lg px-6 py-3 text-base font-semibold hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer"
            >
              <CreditCard className="h-4 w-4" />
              {t("landing.subscriptionCancelled.resubscribe")}
            </button>

            <button
              onClick={handleGoHome}
              className="w-full btn btn-outline border-primary text-primary hover:bg-primary hover:text-white px-6 py-3 text-base font-semibold transition-all duration-300 flex items-center justify-center gap-2"
            >
              <Home className="h-4 w-4" />
              {t("landing.subscriptionCancelled.goHome")}
            </button>

            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="w-full btn bg-red-500 hover:bg-red-600 text-white border-0 px-6 py-3 text-base font-semibold transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" />
              {t("landing.subscriptionCancelled.logout")}
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              {t("landing.subscriptionCancelled.needHelp")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
