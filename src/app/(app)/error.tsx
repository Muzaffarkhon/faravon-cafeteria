"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useClientLocale } from "@/lib/i18n/use-client-locale";
import { translate } from "@/lib/i18n/dict";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const locale = useClientLocale();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  useEffect(() => {
    // Не выводим полный объект ошибки (стек) в консоль посетителя — только digest.
    console.error(`Ошибка страницы${error.digest ? ` (${error.digest})` : ""}`);
  }, [error]);

  return (
    <div className="mx-auto mt-10 max-w-md rounded-[20px] bg-surface px-6 py-10 text-center shadow-sm">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-danger-soft text-danger">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        </svg>
      </span>
      <h1 className="mt-4 font-display text-lg font-bold text-ink">{t("misc.somethingWrong")}</h1>
      <p className="mt-2 text-sm leading-6 text-ink-muted">
        {t("misc.pageLoadFailed")}
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-ink-subtle">{t("misc.errorCode")}: {error.digest}</p>
      )}
      <div className="mt-5 flex justify-center gap-3">
        <Button onClick={reset}>{t("misc.retry")}</Button>
        <Button variant="secondary" onClick={() => router.push("/")}>
          {t("misc.toHome")}
        </Button>
      </div>
    </div>
  );
}
