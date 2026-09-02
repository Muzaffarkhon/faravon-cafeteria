"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button, Field, buttonClass } from "@/components/ui";
import { importEmployees, type ImportState } from "../actions";

export function ImportForm() {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(importEmployees, {});

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <Field
        label="Файл .xlsx"
        htmlFor="file"
        hint="Первый лист. Обязательные столбцы: «Табельный номер», «ФИО». Столбцы находятся по заголовкам — порядок не важен."
      >
        <input
          id="file"
          name="file"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
          className="block w-full text-sm text-ink file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-on-brand hover:file:bg-primary-hover"
        />
      </Field>

      <label className="flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" name="deactivateAbsent" className="mt-0.5 h-4 w-4 accent-[var(--primary)]" />
        <span>
          Деактивировать сотрудников, которых нет в файле
          <span className="block text-xs text-ink-muted">
            Отсутствующий в источнике сотрудник теряет доступ. Их учётные записи
            тоже отключаются. История сохраняется.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm text-ink">
        <input
          type="checkbox"
          name="dryRun"
          defaultChecked
          className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
        />
        <span>
          Только проверить (не изменять базу)
          <span className="block text-xs text-ink-muted">
            Рекомендуется прогнать сначала с этой галочкой, затем снять её и импортировать.
          </span>
        </span>
      </label>

      {state.error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
          {state.error}
        </p>
      )}

      {state.ok && (
        <div className="space-y-2 rounded-md border border-line bg-surface px-4 py-3 text-sm">
          <p className="font-medium text-success-strong">
            {state.dryRun ? "Проверка (без изменений)" : "Импорт завершён."}
          </p>
          <ul className="text-ink-muted">
            <li>{state.dryRun ? "Будет добавлено" : "Добавлено"}: {state.created ?? 0}</li>
            <li>{state.dryRun ? "Будет обновлено" : "Обновлено"}: {state.updated ?? 0}</li>
            {(state.deactivated ?? 0) > 0 && (
              <li className="text-warning-strong">
                {state.dryRun ? "Будет деактивировано" : "Деактивировано"}: {state.deactivated}
              </li>
            )}
          </ul>
          {state.deactivateList && state.deactivateList.length > 0 && (
            <details className="pt-1" open={state.dryRun}>
              <summary className="cursor-pointer text-warning-strong">
                Кого затронет деактивация ({state.deactivateList.length})
              </summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-ink-muted">
                {state.deactivateList.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </details>
          )}
          {state.rowErrors && state.rowErrors.length > 0 && (
            <details className="pt-1">
              <summary className="cursor-pointer text-warning-strong">
                Пропущено строк: {state.rowErrors.length}
              </summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-ink-muted">
                {state.rowErrors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          )}
          {state.dryRun && (
            <p className="pt-1 text-xs text-ink-muted">
              Снимите галочку «Только проверить» и нажмите «Импортировать», чтобы применить.
            </p>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Обработка…" : "Импортировать"}
        </Button>
        <Link href="/admin/users" className={buttonClass({ variant: "secondary" })}>
          {state.ok && !state.dryRun ? "К списку" : "Отмена"}
        </Link>
      </div>
    </form>
  );
}
