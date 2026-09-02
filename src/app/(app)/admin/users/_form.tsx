"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { Role } from "@prisma/client";
import { ROLE_LABELS } from "@/lib/rbac";
import { Button, Field, Input, buttonClass } from "@/components/ui";
import type { EmployeeFormState } from "./actions";
import { ALL_ROLES } from "./roles";

export type EmployeeValues = {
  tabNumber: string;
  fullName: string;
  position: string;
  department: string;
  phone: string | null;
  telegramId: string | null;
};

export function EmployeeForm({
  action,
  initial,
  submitLabel,
  withAccount = false,
}: {
  action: (s: EmployeeFormState, fd: FormData) => Promise<EmployeeFormState>;
  initial?: Partial<EmployeeValues>;
  submitLabel: string;
  /** показать блок «создать учётную запись» (только на странице создания) */
  withAccount?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [makeAccount, setMakeAccount] = useState(false);

  if (state.ok && state.createdId) {
    return (
      <div className="max-w-xl space-y-4">
        <p className="rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success-strong">
          Сотрудник добавлен.
        </p>
        {state.otp && (
          <div className="rounded-md border border-line bg-surface px-4 py-3 text-sm">
            <p className="text-ink-muted">
              Учётная запись <b className="text-ink">{state.login}</b> создана. Одноразовый пароль
              (действует 24&nbsp;ч, показывается один раз):
            </p>
            <p className="mt-1 font-mono text-lg font-semibold text-primary-strong">{state.otp}</p>
            <p className="mt-1 text-xs text-ink-muted">
              Передайте сотруднику логин и пароль. При первом входе система потребует сменить пароль.
            </p>
          </div>
        )}
        <div className="flex gap-3">
          <Link href={`/admin/users/${state.createdId}`} className={buttonClass()}>
            Открыть карточку
          </Link>
          <Link href="/admin/users" className={buttonClass({ variant: "secondary" })}>
            К списку
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      {state.ok && !state.createdId && (
        <p
          className="rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success-strong"
          role="status"
        >
          Изменения сохранены.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Табельный номер" htmlFor="tabNumber" required>
          <Input id="tabNumber" name="tabNumber" defaultValue={initial?.tabNumber ?? ""} inputMode="numeric" autoComplete="off" required />
        </Field>
        <Field label="Телефон" htmlFor="phone" hint="Для идентификации в Telegram-боте (§5.1).">
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="+992 900 000 000"
            defaultValue={initial?.phone ?? ""}
          />
        </Field>
      </div>

      <Field label="ФИО" htmlFor="fullName" required>
        <Input id="fullName" name="fullName" defaultValue={initial?.fullName ?? ""} autoComplete="off" required />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Должность" htmlFor="position" required>
          <Input id="position" name="position" defaultValue={initial?.position ?? ""} required />
        </Field>
        <Field label="Подразделение" htmlFor="department" required>
          <Input
            id="department"
            name="department"
            defaultValue={initial?.department ?? ""}
            required
          />
        </Field>
      </div>

      <Field
        label="Telegram ID"
        htmlFor="telegramId"
        hint="Обычно привязывается ботом. Можно указать вручную по whitelist."
      >
        <Input id="telegramId" name="telegramId" defaultValue={initial?.telegramId ?? ""} inputMode="numeric" autoComplete="off" />
      </Field>

      {withAccount && (
        <div className="space-y-3 rounded-md border border-line-subtle bg-surface-muted/40 p-4">
          <label className="flex items-center gap-2 text-sm font-medium text-ink">
            <input
              type="checkbox"
              name="createAccount"
              checked={makeAccount}
              onChange={(e) => setMakeAccount(e.target.checked)}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            Сразу создать учётную запись для входа
          </label>

          {makeAccount && (
            <div className="space-y-4 pt-1">
              <Field
                label="Логин"
                htmlFor="login"
                hint="Латиница, цифры, «.», «-», «_»; минимум 3 символа."
              >
                <Input id="login" name="login" autoCapitalize="none" spellCheck={false} />
              </Field>
              <RolePicker defaultRoles={["EMPLOYEE"]} />
              <p className="text-xs text-ink-muted">
                Одноразовый пароль будет показан после сохранения.
              </p>
            </div>
          )}
        </div>
      )}

      {state.error && (
        <p
          className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger"
          role="alert"
        >
          {state.error}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
        <Link href="/admin/users" className={buttonClass({ variant: "secondary" })}>
          Отмена
        </Link>
      </div>
    </form>
  );
}

export function RolePicker({
  defaultRoles,
  name = "roles",
}: {
  defaultRoles: Role[];
  name?: string;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium text-ink">Роли</legend>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {ALL_ROLES.map((r) => (
          <label key={r} className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name={name}
              value={r}
              defaultChecked={defaultRoles.includes(r)}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            {ROLE_LABELS[r]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
