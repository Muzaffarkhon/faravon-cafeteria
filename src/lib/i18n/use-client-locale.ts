"use client";

import { useEffect, useState } from "react";
import { LOCALES, LOCALE_COOKIE, type Locale } from "./shared";

function readLocaleCookie(): Locale {
  if (typeof document === "undefined") return "ru";
  const m = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]+)`));
  const v = m ? decodeURIComponent(m[1]) : "";
  return (LOCALES as readonly string[]).includes(v) ? (v as Locale) : "ru";
}

/** Локаль на клиенте для мест, где нет доступа к серверным cookies() — например error/global-error boundary. */
export function useClientLocale(): Locale {
  const [locale, setLocale] = useState<Locale>("ru");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocale(readLocaleCookie());
  }, []);
  return locale;
}
