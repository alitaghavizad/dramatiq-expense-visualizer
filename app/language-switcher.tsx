"use client";

import { Check, ChevronDown, Languages } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supportedLocales, useI18n } from "./i18n/provider";

export default function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentLanguage = t(`language.options.${locale}`);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className={`language-switcher ${className}`.trim()} ref={containerRef}>
      <button
        className="language-trigger"
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={t("language.change", { language: currentLanguage })}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t("language.change", { language: currentLanguage })}
      >
        <Languages size={15} aria-hidden="true" />
        <span>{locale.toUpperCase()}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <div className="language-menu" role="menu" aria-label={t("language.label")}>
          {supportedLocales.map((option) => (
            <button
              className={option === locale ? "is-active" : ""}
              type="button"
              role="menuitemradio"
              aria-checked={option === locale}
              onClick={() => {
                setLocale(option);
                setOpen(false);
              }}
              key={option}
            >
              <span>{t(`language.options.${option}`)}</span>
              <small>{option.toUpperCase()}</small>
              {option === locale && <Check size={14} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
