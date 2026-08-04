import type { MenuItem as ApiMenuItem } from "@/types/menuItem";

interface SelectedOptions {
  [optionId: string]: string[]; // optionId -> selected choice IDs
}

export const getFinalPrice = (product: ApiMenuItem): number => {
  if (!product.discountPercentage || product.discountPercentage <= 0) {
    return product.price; // No discount
  }

  const discountedPrice =
    product.price - (product.price * product.discountPercentage) / 100;
  return Math.max(0, discountedPrice); // Ensure price doesn't go negative
};

export const calculateDiscountedPrice = (
  product: ApiMenuItem,
): number | null => {
  return product.discountPercentage
    ? product.price - (product.price * product.discountPercentage) / 100
    : null;
};

export const calculatePricePerItem = (
  product: ApiMenuItem,
  selectedOptions: SelectedOptions,
): number => {
  // Start with the final price (with discount if available)
  const basePrice = getFinalPrice(product);

  // Add option prices
  let optionsTotal = 0;
  Object.entries(selectedOptions).forEach(([optionId, choiceIds]) => {
    const option = product.options?.find((opt) => opt._id === optionId);
    if (option) {
      choiceIds.forEach((choiceId) => {
        const choice = option.choices.find((c) => c._id === choiceId);
        if (choice) {
          optionsTotal += choice.price;
        }
      });
    }
  });

  return basePrice + optionsTotal;
};

export const calculateTotalPrice = (
  product: ApiMenuItem,
  selectedOptions: SelectedOptions,
  quantity: number,
): number => {
  const pricePerItem = calculatePricePerItem(product, selectedOptions);
  return pricePerItem * quantity;
};

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================
// * Check if all required options are selected
export const areRequiredOptionsSelected = (
  product: ApiMenuItem,
  selectedOptions: SelectedOptions,
): boolean => {
  if (!product.options || product.options.length === 0) return true;

  return product.options.every((option) => {
    if (!option.required) return true;
    const selectedChoices = selectedOptions[option._id] || [];
    return selectedChoices.length > 0;
  });
};

//* Handle option selection and return new selected options state
export const handleOptionSelection = (
  currentSelectedOptions: SelectedOptions,
  optionId: string,
  choiceId: string,
  isMultiple: boolean,
): SelectedOptions => {
  const current = currentSelectedOptions[optionId] || [];
  let newSelection: string[];

  if (isMultiple) {
    // For checkboxes (multiple choice)
    if (current.includes(choiceId)) {
      newSelection = current.filter((id) => id !== choiceId);
    } else {
      newSelection = [...current, choiceId];
    }
  } else {
    // For radio buttons (single choice)
    newSelection = [choiceId];
  }

  return {
    ...currentSelectedOptions,
    [optionId]: newSelection,
  };
};
