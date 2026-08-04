// UI Props
export interface NavbarProps {
  shopName: string;
  logo?: string;
  primaryColor?: string;
  onCartClick: () => void;
}

// Cart Item Option
export interface CartItemOption {
  optionId: string;
  optionName: { en: string; ar: string };
  choices: Array<{
    choiceId: string;
    choiceName: { en: string; ar: string };
    price: number;
  }>;
}

// Final Cart Item
export interface CartItem {
  id: string | undefined;
  name: LocalizedText;
  price: number;
  categoryId: string | undefined;
  available: boolean;
  rating?: string;
  image: string | undefined;
  discount?: {
    type: "percentage" | "fixed";
    value: number;
    active: boolean;
  };
  sizes?: { label: string; price: number }[];
  quantity: number;
  // vat?: number;
  originalPrice?: number;
  customizationDetails?: string;
  selectedOptions?: { [optionId: string]: string[] };
  selectedOptionsDetails?: CartItemOption[];
  uniqueId?: string;
}

// Forms
export interface CustomerForm {
  name: string;
  phone: string;
  tableNumber: string;
  customizationDetails?: string;
}

export interface DynamicInputProps {
  type: "text" | "tel" | "select";
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  className?: string;
}

export interface LocalizedText {
  en: string;
  ar: string;
}
