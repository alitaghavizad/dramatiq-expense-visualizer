"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useI18n } from "./i18n/provider";

type Theme = "light" | "dark";

const STORAGE_KEY = "dramatiq-theme";
const THEME_EVENT = "dramatiq-theme-change";

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function storedTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function currentTheme(): Theme {
  const value = document.documentElement.dataset.theme;
  return value === "light" || value === "dark" ? value : systemTheme();
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function subscribeToTheme(callback: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  function handleThemeChange() {
    callback();
  }

  function handleStorage(event: StorageEvent) {
    if (event.key !== STORAGE_KEY) return;
    const nextTheme = event.newValue === "light" || event.newValue === "dark" ? event.newValue : systemTheme();
    applyTheme(nextTheme);
    callback();
  }

  function handleSystemChange() {
    if (storedTheme()) return;
    applyTheme(systemTheme());
    callback();
  }

  window.addEventListener(THEME_EVENT, handleThemeChange);
  window.addEventListener("storage", handleStorage);
  media.addEventListener("change", handleSystemChange);

  return () => {
    window.removeEventListener(THEME_EVENT, handleThemeChange);
    window.removeEventListener("storage", handleStorage);
    media.removeEventListener("change", handleSystemChange);
  };
}

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  const theme = useSyncExternalStore(subscribeToTheme, currentTheme, () => "light");
  const dark = theme === "dark";

  function toggleTheme() {
    const nextTheme: Theme = dark ? "light" : "dark";
    applyTheme(nextTheme);
    try {
      window.localStorage.setItem(STORAGE_KEY, nextTheme);
    } catch {
      // The theme still applies for this page when storage is unavailable.
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  const label = dark ? t("common.themeLight") : t("common.themeDark");

  return (
    <button
      className={`theme-toggle ${className}`.trim()}
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      aria-pressed={dark}
      title={label}
    >
      <Sun className="theme-icon theme-icon-sun" size={16} aria-hidden="true" />
      <Moon className="theme-icon theme-icon-moon" size={16} aria-hidden="true" />
    </button>
  );
}
