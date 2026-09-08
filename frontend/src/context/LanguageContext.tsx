import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { es } from "../i18n/es";
import type { TranslationKey } from "../i18n/es";
import { en } from "../i18n/en";

export type Language = "es" | "en";

const DICTIONARIES: Record<Language, Record<TranslationKey, string>> = { es, en };
const STORAGE_KEY = "eld-trip-planner:lang";
const SUPPORTED: Language[] = ["es", "en"];

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function resolveInitialLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "es" || stored === "en") return stored;
  } catch {
    // ignore
  }
  const browserLang = typeof navigator !== "undefined" ? navigator.language.slice(0, 2) : "es";
  return SUPPORTED.includes(browserLang as Language) ? (browserLang as Language) : "es";
}

function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return Object.entries(vars).reduce((acc, [key, value]) => acc.replaceAll(`{${key}}`, String(value)), template);
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(resolveInitialLanguage);

  const value = useMemo<LanguageContextValue>(() => {
    const dictionary = DICTIONARIES[language];
    return {
      language,
      setLanguage: (lang: Language) => {
        setLanguageState(lang);
        try {
          localStorage.setItem(STORAGE_KEY, lang);
        } catch {
          // ignore write failures
        }
      },
      t: (key, vars) => format(dictionary[key] ?? key, vars),
    };
  }, [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useTranslation(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useTranslation must be used within a LanguageProvider");
  return ctx;
}
