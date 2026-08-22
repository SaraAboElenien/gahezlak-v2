import { useTranslation } from "react-i18next";

import {
  applyDocumentLanguage,
  storeLanguage,
  type SupportedLanguage,
} from "../libs/i18n";

export const useLang = () => {
  const { i18n } = useTranslation();

  const changeLanguage = (lang: SupportedLanguage) => {
    if (typeof i18n.changeLanguage !== "function") {
      console.error("i18n.changeLanguage is not a function");
      return;
    }

    i18n.changeLanguage(lang);
    // Persisting is what makes the choice survive a full page load. Without
    // it the language reset to English on every refresh, shared link and
    // scanned QR code — see the note on LANGUAGE_STORAGE_KEY in libs/i18n.ts.
    storeLanguage(lang);
    applyDocumentLanguage(lang);
  };

  const toggleLanguage = () => {
    const newLang: SupportedLanguage = i18n.language === "en" ? "ar" : "en";
    changeLanguage(newLang);
  };

  return {
    currentLang: i18n.language,
    changeLanguage,
    toggleLanguage,
  };
};

/* 
  ========= Sample Usage ==========

  const { t } = useTranslation();
  const { toggleLanguage, currentLang } = useLang()

  <h1>{t('welcome')}</h1>
  === Lang Switch Button ====

  <button onClick={toggleLanguage} className="px-4 py-2 rounded bg-slate-200 hover:bg-slate-300 text-black">
    {currentLang === 'en' ? 'العربية' : 'English'}
  </button>

*/
