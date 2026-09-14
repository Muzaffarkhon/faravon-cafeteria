"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { Role } from "@prisma/client";
import { ROLE_LABELS } from "@/lib/rbac";
import { loginFromFullName } from "@/lib/translit";
import { Button, Field, Input, buttonClass } from "@/components/ui";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import type { EmployeeFormState } from "./actions";
import { ALL_ROLES } from "./roles";
import { OtpModal } from "./_otp-modal";

export type EmployeeValues = {
  fullName: string;
  position: string;
  department: string;
  phone: string | null;
  phoneSecondary?: string | null;
  telegramId: string | null;
};

export function EmployeeForm({
  action,
  initial,
  submitLabel,
  withAccount = false,
  locale,
}: {
  action: (s: EmployeeFormState, fd: FormData) => Promise<EmployeeFormState>;
  initial?: Partial<EmployeeValues>;
  submitLabel: string;
  /** показать блок «создать учётную запись» (только на странице создания) */
  withAccount?: boolean;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
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
          <OtpModal otp={state.otp} login={state.login} onClose={() => setOtpSeen(true)} locale={locale} />
        )}
        <p className="rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success-strong">
          {t("users.form.createdPrefix")}{state.login ? ` ${t("users.form.createdAccountSuffix")} «${state.login}»` : ""}.
        </p>
        <div className="flex gap-3">
          <Link href={`/admin/users/${state.createdId}`} className={buttonClass()}>
            {t("users.form.openCard")}
          </Link>
          <Link href="/admin/users" className={buttonClass({ variant: "secondary" })}>
            {t("users.form.toList")}
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
          {t("users.form.changesSaved")}
        </p>
      )}
      <Field label={t("users.form.fullName")} htmlFor="fullName" required hint={t("users.form.fullNameHint")}>
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
        <Field label={t("users.form.position")} htmlFor="position" required>
          <Input id="position" name="position" defaultValue={initial?.position ?? ""} required />
        </Field>
        <Field label={t("users.form.department")} htmlFor="department" required>
          <Input
            id="department"
            name="department"
            defaultValue={initial?.department ?? ""}
            required
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("users.form.primaryPhone")} htmlFor="phone" hint={t("users.form.primaryPhoneHint")}>
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

        <Field label={t("users.form.secondaryPhone")} htmlFor="phoneSecondary" hint={t("users.form.secondaryPhoneHint")}>
          <Input
            id="phoneSecondary"
            name="phoneSecondary"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="+992 900 000 000"
            defaultValue={initial?.phoneSecondary ?? ""}
          />
        </Field>
      </div>

      <Field
        label={t("users.form.telegramId")}
        htmlFor="telegramId"
        hint={t("users.form.telegramIdHint")}
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
            {t("users.form.createAccountNow")}
          </label>

          {makeAccount && (
            <div className="space-y-4 pt-1">
              <Field
                label={t("users.form.loginLabel")}
                htmlFor="login"
                hint={t("users.form.loginGenHint")}
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
                      {t("users.form.fromFullName")}
                    </Button>
                  )}
                </div>
              </Field>
              <RolePicker defaultRoles={["EMPLOYEE"]} allowedRoles={["EMPLOYEE", "C_AND_B"]} locale={locale} />
              <p className="text-xs text-ink-muted">
                {t("users.form.otpHint")}
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
          {t("users.form.cancel")}
        </Link>
      </div>
    </form>
  );
}

export function RolePicker({
  defaultRoles,
  allowedRoles = ALL_ROLES,
  name = "roles",
  locale,
}: {
  defaultRoles: Role[];
  allowedRoles?: Role[];
  name?: string;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [selected, setSelected] = useState<Role[]>(() =>
    defaultRoles.filter((r) => allowedRoles.includes(r)),
  );

  const toggle = (r: Role) => {
    setSelected((cur) => {
      if (cur.includes(r)) {
        return cur.filter((x) => x !== r);
      }
      if (r === "CONTRACTOR") {
        return ["CONTRACTOR"];
      }
      return [...cur.filter((x) => x !== "CONTRACTOR"), r];
    });
  };

  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium text-ink">{t("users.form.roles")}</legend>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {allowedRoles.map((r) => (
          <label key={r} className="flex items-center gap-2 text-sm text-ink cursor-pointer">
            <input
              type="checkbox"
              name={name}
              value={r}
              checked={selected.includes(r)}
              onChange={() => toggle(r)}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            {ROLE_LABELS[r]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
