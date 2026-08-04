import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useLang } from "@/hooks/useLang";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  validateOrderInStorage,
  clearOrderData,
  ORDER_TIMEOUT_HOURS,
} from "@/utils/orderUtils";

interface UseOrderValidationOptions {
  slug: string;
  onValidOrder?: (orderNumber: string) => void;
  redirectOnInvalid?: boolean;
}

export const useOrderValidation = ({
  slug,
  onValidOrder,
  redirectOnInvalid = true,
}: UseOrderValidationOptions) => {
  const navigate = useNavigate();
  const { currentLang } = useLang();
  const { t } = useTranslation();

  useEffect(() => {
    const validation = validateOrderInStorage();

    if (!validation.isValid) {
      // No order found or expired
      if (redirectOnInvalid) {
        if (validation.reason === "expired") {
          toast.error(t("publicMenu.orderExpired"));
        } else {
          toast.error(t("publicMenu.noRecentOrder"));
        }
        navigate(`/shops/${slug}/menu`, { replace: true });
      }
      return;
    }

    // Order is valid, call the callback if provided
    if (onValidOrder && validation.orderNumber) {
      onValidOrder(validation.orderNumber);
    }
  }, [currentLang, navigate, slug, redirectOnInvalid, onValidOrder, t]);

  // Return utility functions for manual validation
  const validateOrder = () => {
    return validateOrderInStorage();
  };

  return {
    validateOrder,
    clearOrderData,
    ORDER_TIMEOUT_HOURS,
  };
};
