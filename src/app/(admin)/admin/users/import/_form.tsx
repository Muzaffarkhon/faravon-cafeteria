"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button, Field, buttonClass } from "@/components/ui";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { importEmployees, type ImportState } from "../actions";

export function ImportForm({ locale }: { locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [state, formAction, pending] = useActionState<ImportState, FormData>(importEmployees, {});

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <Field
        label={t("users.imp.fileLabel")}
        htmlFor="file"
        hint={t("users.imp.fileHint")}
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
        <input
          type="checkbox"
          name="createAccounts"
          defaultChecked
          className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
        />
        <span>
          {t("users.imp.createAccounts")}
          <span className="block text-xs text-ink-muted">
            {t("users.imp.createAccountsHint")}
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" name="deactivateAbsent" className="mt-0.5 h-4 w-4 accent-[var(--primary)]" />
        <span>
          {t("users.imp.deactivateAbsent")}
          <span className="block text-xs text-ink-muted">
            {t("users.imp.deactivateAbsentHint")}
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
          {t("users.imp.dryRun")}
          <span className="block text-xs text-ink-muted">
            {t("users.imp.dryRunHint")}
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
            {state.dryRun ? t("users.imp.checkResult") : t("users.imp.importDone")}
          </p>
          <ul className="text-ink-muted">
            <li>{state.dryRun ? t("users.imp.willAdd") : t("users.imp.added")}: {state.created ?? 0}</li>
            <li>{state.dryRun ? t("users.imp.willCreateLogins") : t("users.imp.createdLogins")}: {state.usersCreated ?? state.created ?? 0}</li>
            <li>{state.dryRun ? t("users.imp.willUpdate") : t("users.imp.updated")}: {state.updated ?? 0}</li>
            {(state.deactivated ?? 0) > 0 && (
              <li className="text-warning-strong">
                {state.dryRun ? t("users.imp.willDeactivate") : t("users.imp.deactivated")}: {state.deactivated}
              </li>
            )}
          </ul>
          {state.deactivateList && state.deactivateList.length > 0 && (
            <details className="pt-1" open={state.dryRun}>
              <summary className="cursor-pointer text-warning-strong">
                {t("users.imp.affectedByDeactivation")} ({state.deactivateList.length})
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
                {t("users.imp.skippedRows")} {state.rowErrors.length}
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
              {t("users.imp.dryRunHint2")}
            </p>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t("users.imp.processing") : t("users.imp.import")}
        </Button>
        <Link href="/admin/users" className={buttonClass({ variant: "secondary" })}>
          {state.ok && !state.dryRun ? t("users.imp.toList") : t("users.imp.cancel")}
        </Link>
      </div>
    </form>
  );
}
