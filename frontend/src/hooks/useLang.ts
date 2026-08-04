import { useTranslation } from "react-i18next";

export const useLang = () => {
  const { i18n } = useTranslation();

  const changeLanguage = (lang: "en" | "ar") => {
    if (typeof i18n.changeLanguage === "function") {
      i18n.changeLanguage(lang);
      document.documentElement.lang = lang;
      document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    } else {
      console.error("i18n.changeLanguage is not a function");
    }
  };

  const toggleLanguage = () => {
    const newLang = i18n.language === "en" ? "ar" : "en";
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
