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
      const saved = window.localStorage.getItem("liveopweg-language");
      if (saved === "nl" || saved === "en") {
        setLanguage(saved);
        document.documentElement.lang = saved;
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const updateLanguage = useCallback((next: Language) => {
    setLanguage(next);
    window.localStorage.setItem("liveopweg-language", next);
    document.documentElement.lang = next;
  }, []);
  
  const t = useCallback((key: string): string => {
    const entry = translations[language][key as keyof typeof nl];
    if (!entry) return key;
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
