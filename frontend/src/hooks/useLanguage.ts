import { useEffect, useState } from "react";

const STORAGE_KEY = "app.language";
const DEFAULT_LANGUAGE = "en";
const ALLOWED_LANGUAGES = ["en", "pt", "es", "fr", "de"] as const;

function normalize(lang: string): string {
  return (ALLOWED_LANGUAGES as readonly string[]).includes(lang) ? lang : DEFAULT_LANGUAGE;
}

function loadPersisted(): string {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? normalize(stored) : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export function useLanguage() {
  const [language, setLanguageState] = useState<string>(loadPersisted);

  function setLanguage(lang: string) {
    const validated = normalize(lang);
    setLanguageState(validated);
    try {
      localStorage.setItem(STORAGE_KEY, validated);
    } catch {
      // localStorage unavailable — state still updates in memory
    }
  }

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return { language, setLanguage };
}