"use client";

import { useEffect } from "react";
import { useClientLocale } from "@/lib/i18n/use-client-locale";
import { translate } from "@/lib/i18n/dict";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = useClientLocale();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  useEffect(() => {
    console.error(`Ошибка приложения${error.digest ? ` (${error.digest})` : ""}`);
  }, [error]);

  return (
    <html lang={locale}>
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#faf7f7",
          color: "#1f1a1a",
        }}
      >
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 18 }}>{t("misc.serviceUnavailable")}</h1>
          <p style={{ fontSize: 14, color: "#6b6060" }}>
            {t("misc.serviceUnavailableHint")}
          </p>
          {error.digest && (
            <p style={{ fontSize: 11, color: "#9a8f8f", fontFamily: "monospace" }}>
              {t("misc.errorCode")}: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: 16,
              padding: "8px 16px",
              border: 0,
              borderRadius: 6,
              background: "oklch(0.577 0.216 27)",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t("misc.refresh")}
          </button>
        </div>
      </body>
    </html>
  );
}
