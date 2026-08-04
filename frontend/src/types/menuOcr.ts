export interface LocalizedText {
  en: string;
  ar: string;
}

// Category interface from the response
export interface ExtractedCategory {
  name: LocalizedText;
  description: LocalizedText;
}

// Menu item interface from the response
export interface ExtractedMenuItem {
  name: LocalizedText;
  description: LocalizedText;
  price: number;
  category: string;
  isAvailable: boolean;
}

export interface OcrData {
  categories: ExtractedCategory[];
  items: ExtractedMenuItem[];
  errors: { index: number; error: string }[];
  warnings: string[];
}

// The full response interface
export interface MutateOcrResponse {
  message: string;
  data: OcrData;
}
