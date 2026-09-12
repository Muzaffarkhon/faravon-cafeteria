"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { generateMissingEmployeeAccounts } from "./actions";

export function GenerateMissingAccountsBanner({ missingCount }: { missingCount: number }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok?: boolean; error?: string; count?: number } | null>(
    null,
  );

  if (missingCount <= 0 && !result) return null;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-warning-strong/30 bg-warning-soft/25 p-4 shadow-sm">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-warning-strong font-semibold text-sm">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          {missingCount > 0
            ? `У ${missingCount} сотрудников нет учётной записи для входа`
            : "Все сотрудники имеют учётные записи"}
        </div>
        <p className="text-xs text-ink-muted">
          Сотрудники без учётной записи не могут войти на сайт и не распознаются в Telegram-боте.
          Нажмите кнопку, чтобы автоматически сгенерировать уникальные логины для всех.
        </p>
        {result?.ok && (
          <p className="text-xs font-semibold text-success-strong">
            Успешно создано учётных записей: {result.count}
          </p>
        )}
        {result?.error && (
          <p className="text-xs font-semibold text-danger">{result.error}</p>
        )}
      </div>

      {missingCount > 0 && (
        <div className="shrink-0">
          <Button
            type="button"
            size="sm"
            loading={pending}
            disabled={pending}
            onClick={() => {
              if (
                !confirm(
                  `Сгенерировать учётные записи и логины для ${missingCount} сотрудников?`,
                )
              ) {
                return;
              }
              start(async () => {
                const res = await generateMissingEmployeeAccounts();
                setResult(res);
              });
            }}
          >
            Сгенерировать логины ({missingCount})
          </Button>
        </div>
      )}
    </div>
  );
}
