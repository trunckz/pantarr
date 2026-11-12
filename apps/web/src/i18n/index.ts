// Interface languages: add one by dropping <lang>.json next to this file and listing it below.
import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import fr from "./fr.json";

export const LANGUAGES: Record<string, string> = { en: "English", fr: "Français" };

i18n.use(LanguageDetector).use(initReactI18next).init({
  resources: { en: { translation: en }, fr: { translation: fr } },
  fallbackLng: "en",
  supportedLngs: Object.keys(LANGUAGES),
  interpolation: { escapeValue: false },
});
// <html lang> follows the interface language (screen readers, hyphenation, translation offers of the browser)
const setLang = (l: string) => { if (typeof document !== "undefined") document.documentElement.lang = (l || "en").split("-")[0]; };
setLang(i18n.resolvedLanguage ?? i18n.language);
i18n.on("languageChanged", setLang);
export default i18n;
