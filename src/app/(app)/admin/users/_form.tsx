"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { Role } from "@prisma/client";
import { ROLE_LABELS } from "@/lib/rbac";
import { loginFromFullName } from "@/lib/translit";
import { Button, Field, Input, buttonClass } from "@/components/ui";
import type { EmployeeFormState } from "./actions";
import { ALL_ROLES } from "./roles";
import { OtpModal } from "./_otp-modal";

export type EmployeeValues = {
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
  const [makeAccount, setMakeAccount] = useState(withAccount);
  const [fullName, setFullName] = useState(initial?.fullName ?? "");
  const [login, setLogin] = useState("");
  const [loginTouched, setLoginTouched] = useState(false);
  const [otpSeen, setOtpSeen] = useState(false);

  const suggestedLogin = loginFromFullName(fullName);
  const loginValue = loginTouched ? login : suggestedLogin;

  if (state.ok && state.createdId) {
    return (
      <div className="max-w-xl space-y-4">
        {state.otp && !otpSeen && (
          <OtpModal otp={state.otp} login={state.login} onClose={() => setOtpSeen(true)} />
        )}
        <p className="rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success-strong">
          Сотрудник добавлен{state.login ? ` · учётная запись «${state.login}»` : ""}.
        </p>
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
      <Field label="ФИО" htmlFor="fullName" required hint="Фамилия Имя Отчество. Допускаются таджикские буквы (ғ ӣ қ ӯ ҳ ҷ).">
        <Input
          id="fullName"
          name="fullName"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoComplete="off"
          required
        />
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

      <Field label="Телефон" htmlFor="phone" hint="Для идентификации в Telegram-боте.">
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
                hint="Сгенерирован из ФИО, можно поправить. Латиница, цифры, «.», «-», «_»."
              >
                <div className="flex gap-2">
                  <Input
                    id="login"
                    name="login"
                    value={loginValue}
                    onChange={(e) => {
                      setLoginTouched(true);
                      setLogin(e.target.value.toLowerCase());
                    }}
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                  {loginTouched && suggestedLogin && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        setLoginTouched(false);
                        setLogin("");
                      }}
                    >
                      Из ФИО
                    </Button>
                  )}
                </div>
              </Field>
              <RolePicker defaultRoles={["EMPLOYEE"]} />
              <p className="text-xs text-ink-muted">
                Одноразовый пароль покажется в окне сразу после сохранения.
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
