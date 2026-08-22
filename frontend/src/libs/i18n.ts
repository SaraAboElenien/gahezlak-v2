"use client";

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enTranslations from "../locales/en.json";
import arTranslations from "../locales/ar.json";

const resources = {
  en: { translation: enTranslations },
  ar: { translation: arTranslations },
};

export const SUPPORTED_LANGUAGES = ["en", "ar"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * Where the chosen language is remembered.
 *
 * This used to be nowhere. `init({ lng: "en" })` hardcoded English on every
 * load and `useLang.changeLanguage` only mutated in-memory i18next state plus
 * the two document attributes, so the choice survived exactly as long as the
 * document did. Any full page load threw it away: a refresh, a shared link, the
 * QR code a diner scans at the table, or following a link the SPA does not
 * intercept. For an app whose primary market reads Arabic that is not a
 * cosmetic bug — an Arabic speaker had to re-pick their language on every
 * arrival, and the layout snapped back to left-to-right with it.
 *
 * localStorage rather than a cookie because nothing server-side needs to read
 * it: the frontend Express server injects per-shop <head> tags but does not
 * render the body, so the language only has to survive on the client.
 */
export const LANGUAGE_STORAGE_KEY = "gahezlak.lang";

function isSupported(value: string | null): value is SupportedLanguage {
  return (
    value !== null && (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
  );
}

/**
 * The remembered language, or null if there is none or it is not one we ship.
 *
 * Every access is wrapped: localStorage *throws* on read in Safari private
 * browsing and wherever site data is blocked, and this runs at module import
 * before React mounts — an exception here would blank the whole app rather than
 * degrade one preference.
 */
export function readStoredLanguage(): SupportedLanguage | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isSupported(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function storeLanguage(lang: SupportedLanguage): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // Storage unavailable. The language still applies to this document; it
    // just will not outlive it, which is the old behaviour.
  }
}

/**
 * The document half of a language change: the `lang` and `dir` attributes.
 *
 * Kept here rather than only in `useLang` because it has to run at boot too.
 * Every RTL rule in the stylesheet hangs off `dir`, so restoring the language
 * without restoring the direction would translate the text and leave the
 * layout mirrored the wrong way.
 */
export function applyDocumentLanguage(lang: SupportedLanguage): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
}

const initialLanguage: SupportedLanguage = readStoredLanguage() ?? "en";

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: initialLanguage,
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
  });
}

// Unconditional, and outside the isInitialized guard: `index.html` ships
// `lang="en"` with no `dir` at all, so even the English default needs `dir`
// set for the stylesheet's direction-scoped rules to have anything to match.
applyDocumentLanguage(initialLanguage);

export default i18n;
