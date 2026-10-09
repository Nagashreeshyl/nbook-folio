"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  isLocale,
  RTL_LOCALES,
  translate,
  type Locale,
  type StringKey,
} from "@/lib/i18n";

interface I18nValue {
  locale: Locale;
  dir: "ltr" | "rtl";
  setLocale: (locale: Locale) => void;
  t: (key: StringKey) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

const STORAGE_KEY = "nbook.locale";

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(value)) return value;
  } catch {
    /* storage unavailable */
  }
  const nav = window.navigator.language?.slice(0, 2);
  if (isLocale(nav)) return nav;
  return "en";
}

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? "en");

  useEffect(() => {
    if (initialLocale) return;
    setLocaleState(readStoredLocale());
  }, [initialLocale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const dir = RTL_LOCALES.has(locale) ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  const t = useCallback((key: StringKey) => translate(locale, key), [locale]);

  const value = useMemo<I18nValue>(() => ({ locale, dir, setLocale, t }), [locale, dir, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
