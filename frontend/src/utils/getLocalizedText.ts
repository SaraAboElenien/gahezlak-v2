import type { LocalizedText } from "@/types/category";

function getLocalizedText(text: LocalizedText, lang: string): string {
  if (lang === "en" || lang === "ar") {
    return text[lang];
  }
  return text.en; // or whatever default you prefer
}

export default getLocalizedText;
