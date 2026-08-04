//TODO: modify if needed
export const ORDER_TIMEOUT_HOURS = 2;

export interface OrderValidationResult {
  isValid: boolean;
  orderNumber: string | null;
  reason: "no_order" | "expired" | null;
}

/**
 * Validates order stored in localStorage
 */
export const validateOrderInStorage = (): OrderValidationResult => {
  const lastOrderNumber = localStorage.getItem("lastOrderNumber");
  const orderTimestamp = localStorage.getItem("lastOrderTimestamp");

  if (!lastOrderNumber || !orderTimestamp) {
    return { isValid: false, orderNumber: null, reason: "no_order" };
  }

  const timestamp = parseInt(orderTimestamp);
  const now = Date.now();
  const hoursSinceOrder = (now - timestamp) / (1000 * 60 * 60);

  if (hoursSinceOrder > ORDER_TIMEOUT_HOURS) {
    // Clean up expired data
    localStorage.removeItem("lastOrderNumber");
    localStorage.removeItem("lastOrderTimestamp");
    return { isValid: false, orderNumber: null, reason: "expired" };
  }

  return { isValid: true, orderNumber: lastOrderNumber, reason: null };
};

/**
 * Clears order data from localStorage
 */
export const clearOrderData = () => {
  localStorage.removeItem("lastOrderNumber");
  localStorage.removeItem("lastOrderTimestamp");
};

/**
 * Gets order number from localStorage if valid
 */
export const getValidOrderNumber = (): string | null => {
  const validation = validateOrderInStorage();
  return validation.isValid ? validation.orderNumber : null;
};
