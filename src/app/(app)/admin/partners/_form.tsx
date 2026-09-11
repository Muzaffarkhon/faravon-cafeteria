"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { PARTNER_STATUSES, PARTNER_STATUS_LABELS } from "@/lib/labels";
import { Button, Field, Input, Select, Textarea, buttonClass } from "@/components/ui";
import { ImageUploadField } from "../../_components/image-upload-field";
import { loginFromPartnerName } from "@/lib/translit";
import { OtpModal } from "../users/_otp-modal";
import type { PartnerFormState } from "./actions";

export type PartnerValues = {
  name: string;
  status: string;
  category: string | null;
  contactPerson: string | null;
  contacts: string | null;
  discountType: string | null;
  terms: string | null;
  responsible: string | null;
  logoUrl: string | null;
  contractStart: Date | string | null;
  contractEnd: Date | string | null;
};

function d(v: Date | string | null) {
  if (!v) return "";
  return new Date(v).toISOString().slice(0, 10);
}

export function PartnerForm({
  action,
  initial,
  submitLabel,
}: {
  action: (s: PartnerFormState, fd: FormData) => Promise<PartnerFormState>;
  initial?: Partial<PartnerValues>;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [name, setName] = useState(initial?.name ?? "");
  const [logoUrl, setLogoUrl] = useState(initial?.logoUrl ?? "");
  const [makeAccount, setMakeAccount] = useState(!initial);
  const [contractorLogin, setContractorLogin] = useState("");
  const [loginTouched, setLoginTouched] = useState(false);
  const [otpSeen, setOtpSeen] = useState(false);

  const suggestedLogin = loginFromPartnerName(name);
  const loginValue = loginTouched ? contractorLogin : suggestedLogin;

  if (state.success && state.partnerId) {
    return (
      <div className="max-w-xl space-y-4">
        {state.otp && !otpSeen && (
          <OtpModal
            otp={state.otp}
            login={state.login}
            onClose={() => setOtpSeen(true)}
          />
        )}
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-3 text-success-strong">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success-soft">
              <svg width="22" height="22" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink">
                Партнёр успешно добавлен!
              </h2>
              <p className="text-xs text-ink-muted">
                {state.partnerName}
              </p>
            </div>
          </div>

          {state.login && (
            <div className="rounded-xl border border-line-subtle bg-surface-muted/50 p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Учётная запись подрядчика создана
              </p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-muted">Логин:</span>
                <span className="font-mono font-bold text-ink">{state.login}</span>
              </div>
              {state.otp && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-muted">Временный пароль:</span>
                  <span className="font-mono font-bold text-primary-strong">{state.otp}</span>
                </div>
              )}
              <p className="text-xs text-ink-subtle pt-1">
                Кассир/администратор партнёра может входить на платформу по этому логину и гасить купоны в разделе «Активация купонов».
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <Link href={`/admin/partners/${state.partnerId}`} className={buttonClass()}>
              Перейти к партнёру
            </Link>
            <Link href="/admin/partners" className={buttonClass({ variant: "secondary" })}>
              К списку партнёров
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <Field label="Название" htmlFor="name" required>
        <Input
          id="name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="organization"
          required
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Статус" htmlFor="status">
          <Select id="status" name="status" defaultValue={initial?.status ?? "ACTIVE"}>
            {PARTNER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PARTNER_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Категория" htmlFor="category">
          <Input id="category" name="category" defaultValue={initial?.category ?? ""} />
        </Field>
      </div>

      <Field label="Тип скидки / условие" htmlFor="discountType">
        <Input id="discountType" name="discountType" defaultValue={initial?.discountType ?? ""} />
      </Field>

      <Field label="Условия (подробно)" htmlFor="terms">
        <Textarea id="terms" name="terms" defaultValue={initial?.terms ?? ""} rows={2} />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Контактное лицо" htmlFor="contactPerson">
          <Input id="contactPerson" name="contactPerson" defaultValue={initial?.contactPerson ?? ""} autoComplete="off" />
        </Field>
        <Field label="Контакты" htmlFor="contacts">
          <Input id="contacts" name="contacts" defaultValue={initial?.contacts ?? ""} autoComplete="off" placeholder="телефон, email, Telegram…" />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Договор с" htmlFor="contractStart">
          <Input id="contractStart" type="date" name="contractStart" defaultValue={d(initial?.contractStart ?? null)} />
        </Field>
        <Field label="Договор по" htmlFor="contractEnd">
          <Input id="contractEnd" type="date" name="contractEnd" defaultValue={d(initial?.contractEnd ?? null)} />
        </Field>
      </div>

      <Field label="Ответственный (Фаровон)" htmlFor="responsible">
        <Input id="responsible" name="responsible" defaultValue={initial?.responsible ?? ""} autoComplete="off" />
      </Field>

      <div>
        <input type="hidden" name="logoUrl" value={logoUrl} />
        <ImageUploadField
          value={logoUrl}
          onChange={setLogoUrl}
          purpose="card"
          aspect={1}
          label="Логотип партнёра"
          hint="Загрузите логотип и настройте его положение (кадрирование 1:1), либо укажите ссылку."
        />
      </div>

      {!initial && (
        <div className="space-y-3 rounded-xl border border-line-subtle bg-surface-muted/40 p-4">
          <label className="flex items-center gap-2 text-sm font-medium text-ink cursor-pointer">
            <input
              type="checkbox"
              name="createContractorAccount"
              checked={makeAccount}
              onChange={(e) => setMakeAccount(e.target.checked)}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            Сразу создать учётную запись подрядчика для входа
          </label>
          <p className="text-xs text-ink-muted">
            Учётная запись получит роль «Подрядчик» и привязку к этому партнёру для активации купонов на /provider.
          </p>

          {makeAccount && (
            <div className="space-y-2 pt-1">
              <Field
                label="Логин подрядчика"
                htmlFor="contractorLogin"
                hint="Сгенерирован из названия компании. Латиница, цифры, дефис или подчёркивание."
              >
                <div className="flex gap-2">
                  <Input
                    id="contractorLogin"
                    name="contractorLogin"
                    value={loginValue}
                    onChange={(e) => {
                      setLoginTouched(true);
                      setContractorLogin(e.target.value.toLowerCase());
                    }}
                    autoCapitalize="none"
                    spellCheck={false}
                    required={makeAccount}
                  />
                  {loginTouched && suggestedLogin && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        setLoginTouched(false);
                        setContractorLogin("");
                      }}
                    >
                      Из названия
                    </Button>
                  )}
                </div>
              </Field>
              <p className="text-xs text-ink-muted">
                Одноразовый пароль (OTP) покажется в окне сразу после сохранения.
              </p>
            </div>
          )}
        </div>
      )}

      {state.error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
        <Link href="/admin/partners" className={buttonClass({ variant: "secondary" })}>
          Отмена
        </Link>
      </div>
    </form>
  );
}
