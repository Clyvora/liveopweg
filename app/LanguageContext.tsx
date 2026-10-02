"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import nl from "./locales/nl.json";
import en from "./locales/en.json";

type Language = "nl" | "en";

const translations = { nl, en };
interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("nl");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      let saved: string | null = null;
      try {
        saved = window.localStorage.getItem("liveopweg-language");
      } catch {
        // Use the default language when browser storage is unavailable.
      }
      if (saved === "nl" || saved === "en") {
        setLanguage(saved);
        document.documentElement.lang = saved;
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const updateLanguage = useCallback((next: Language) => {
    setLanguage(next);
    try {
      window.localStorage.setItem("liveopweg-language", next);
    } catch {
      // Language still applies for this session even when it cannot be persisted.
    }
    document.documentElement.lang = next;
  }, []);
  
  const t = useCallback((key: string): string => {
    const entry = translations[language][key as keyof typeof nl];
    if (!entry) {
      const fallback = translations.nl[key as keyof typeof nl];
      return fallback ?? key;
    }
    return entry;
  }, [language]);
  
  return (
    <LanguageContext.Provider value={{ language, setLanguage: updateLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
