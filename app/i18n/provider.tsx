"use client";

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import de from "./locales/de.json";
import en from "./locales/en.json";
import hy from "./locales/hy.json";

export type Locale = "en" | "hy" | "de";

type TranslationParams = Record<string, string | number>;
type Dictionary = Record<string, unknown>;
type I18nValue = {
  locale: Locale;
  intlLocale: string;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: TranslationParams) => string;
};

export const supportedLocales: readonly Locale[] = ["en", "hy", "de"];

const dictionaries: Record<Locale, Dictionary> = { en, hy, de };
const intlLocales: Record<Locale, string> = { en: "en-US", hy: "hy-AM", de: "de-DE" };
const STORAGE_KEY = "dramatiq-locale";
const LOCALE_EVENT = "dramatiq-locale-change";
const I18nContext = createContext<I18nValue | null>(null);

function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "hy" || value === "de";
}

function systemLocale(): Locale {
  const language = window.navigator.language.toLowerCase();
  if (language.startsWith("hy")) return "hy";
  if (language.startsWith("de")) return "de";
  return "en";
}

function storedLocale(): Locale | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

function currentLocale(): Locale {
  const value = document.documentElement.dataset.locale;
  return isLocale(value) ? value : storedLocale() ?? systemLocale();
}

function applyLocale(locale: Locale) {
  document.documentElement.dataset.locale = locale;
  document.documentElement.lang = locale;
  document.documentElement.dir = "ltr";
}

function subscribeToLocale(callback: () => void) {
  function handleLocaleChange() {
    callback();
  }

  function handleStorage(event: StorageEvent) {
    if (event.key !== STORAGE_KEY) return;
    const locale = isLocale(event.newValue) ? event.newValue : systemLocale();
    applyLocale(locale);
    callback();
  }

  window.addEventListener(LOCALE_EVENT, handleLocaleChange);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(LOCALE_EVENT, handleLocaleChange);
    window.removeEventListener("storage", handleStorage);
  };
}

function dictionaryValue(dictionary: Dictionary, key: string): string | null {
  let value: unknown = dictionary;
  for (const segment of key.split(".")) {
    if (!value || typeof value !== "object" || !(segment in value)) return null;
    value = (value as Dictionary)[segment];
  }
  return typeof value === "string" ? value : null;
}

function translate(locale: Locale, key: string, params: TranslationParams = {}) {
  const template = dictionaryValue(dictionaries[locale], key) ?? dictionaryValue(dictionaries.en, key) ?? key;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params[name] ?? `{{${name}}}`));
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore<Locale>(subscribeToLocale, currentLocale, () => "en");
  const value = useMemo<I18nValue>(() => ({
    locale,
    intlLocale: intlLocales[locale],
    setLocale(nextLocale) {
      applyLocale(nextLocale);
      try {
        window.localStorage.setItem(STORAGE_KEY, nextLocale);
      } catch {
        // The locale still applies for this page when storage is unavailable.
      }
      window.dispatchEvent(new Event(LOCALE_EVENT));
    },
    t: (key, params) => translate(locale, key, params),
  }), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
