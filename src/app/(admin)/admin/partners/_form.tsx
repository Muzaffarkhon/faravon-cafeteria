"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { PARTNER_STATUSES, partnerStatusLabel } from "@/lib/labels";
import { Button, Field, Input, Select, Textarea, buttonClass } from "@/components/ui";
import { RichTextarea } from "@/components/rich-textarea";
import { FormattedText } from "@/components/formatted-text";
import { TranslationFields } from "@/components/translation-fields";
import { ImageUploadField } from "@/app/(app)/_components/image-upload-field";
import { loginFromPartnerName } from "@/lib/translit";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { OtpModal } from "../users/_otp-modal";
import type { PartnerFormState } from "./actions";

export type PartnerValues = {
  name: string;
  status: string;
  deliveryMode: string;
  category: string | null;
  address: string | null;
  workingHours: string | null;
  contactPerson: string | null;
  contacts: string | null;
  discountType: string | null;
  terms: string | null;
  responsible: string | null;
  logoUrl: string | null;
  contractStart: Date | string | null;
  contractEnd: Date | string | null;
  translations?: Partial<Record<"tg" | "uz", Record<string, string>>> | null;
};

const PARTNER_TRANSLATION_FIELDS = [
  { name: "name", label: "Название" },
  { name: "discountType", label: "Тип скидки / условие" },
  { name: "terms", label: "Условия (подробно)", multiline: true },
  { name: "contactPerson", label: "Контактное лицо" },
];

function d(v: Date | string | null) {
  if (!v) return "";
  return new Date(v).toISOString().slice(0, 10);
}

export function PartnerForm({
  action,
  initial,
  submitLabel,
  locale,
}: {
  action: (s: PartnerFormState, fd: FormData) => Promise<PartnerFormState>;
  initial?: Partial<PartnerValues>;
  submitLabel: string;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [state, formAction, pending] = useActionState(action, {});
  const [name, setName] = useState(initial?.name ?? "");
  const [terms, setTerms] = useState(initial?.terms ?? "");
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
            permanent
            onClose={() => setOtpSeen(true)}
            locale={locale}
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
                {t("partners.form.createdTitle")}
              </h2>
              <p className="text-xs text-ink-muted">
                {state.partnerName}
              </p>
            </div>
          </div>

          {state.login && (
            <div className="rounded-xl border border-line-subtle bg-surface-muted/50 p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                {t("partners.form.accountCreated")}
              </p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-muted">{t("partners.form.login")}</span>
                <span className="font-mono font-bold text-ink">{state.login}</span>
              </div>
              {state.otp && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-muted">{t("partners.form.tempPassword")}</span>
                  <span className="font-mono font-bold text-primary-strong">{state.otp}</span>
                </div>
              )}
              <p className="text-xs text-ink-subtle pt-1">
                {t("partners.form.cashierHint")}
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <Link href={`/admin/partners/${state.partnerId}`} className={buttonClass()}>
              {t("partners.form.goToPartner")}
            </Link>
            <Link href="/admin/partners" className={buttonClass({ variant: "secondary" })}>
              {t("partners.form.toPartnersList")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <Field label={t("partners.form.name")} htmlFor="name" required>
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
        <Field label={t("partners.form.status")} htmlFor="status">
          <Select id="status" name="status" defaultValue={initial?.status ?? "ACTIVE"}>
            {PARTNER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {partnerStatusLabel(locale, s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("partners.form.category")} htmlFor="category">
          <Input id="category" name="category" defaultValue={initial?.category ?? ""} />
        </Field>
      </div>

      <Field
        label={t("partners.form.deliveryMode")}
        htmlFor="deliveryMode"
        hint={t("partners.form.deliveryModeHint")}
      >
        <Select id="deliveryMode" name="deliveryMode" defaultValue={initial?.deliveryMode ?? "QR"}>
          <option value="QR">{t("partners.form.deliveryQr")}</option>
          <option value="PHONE_PROMO">{t("partners.form.deliveryPhone")}</option>
        </Select>
      </Field>

      <Field label={t("partners.form.discountType")} htmlFor="discountType" hint={t("partners.form.discountTypeHint")}>
        <Input id="discountType" name="discountType" defaultValue={initial?.discountType ?? ""} />
      </Field>

      <Field
        label={t("partners.form.terms")}
        htmlFor="terms"
        hint={
          <>
            {t("partners.form.termsHint")}
            <br />
            Ctrl+B — жирный, Ctrl+I — курсив, Ctrl+U — подчёркнутый, Ctrl+Shift+X — зачёркнутый, Ctrl+Alt+1 — заголовок строки
          </>
        }
      >
        <RichTextarea
          id="terms"
          name="terms"
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          rows={3}
        />
      </Field>
      {terms.trim() && (
        <div className="rounded-xl border border-line-subtle bg-surface-muted/50 p-3">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-ink-muted">
            Предпросмотр (как увидит сотрудник)
          </p>
          <div className="mt-1.5 text-sm leading-6 text-ink">
            <FormattedText text={terms} />
          </div>
        </div>
      )}

      <p className="pt-1 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
        {t("partners.form.whereToGoTitle")}
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("partners.form.address")} htmlFor="address" hint={t("partners.form.addressHint")}>
          <Input id="address" name="address" defaultValue={initial?.address ?? ""} autoComplete="off" />
        </Field>
        <Field label={t("partners.form.workingHours")} htmlFor="workingHours">
          <Input id="workingHours" name="workingHours" defaultValue={initial?.workingHours ?? ""} autoComplete="off" placeholder="Пн–Вс, 8:00–22:00" />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("partners.form.contactPerson")} htmlFor="contactPerson" hint={t("partners.form.contactPersonHint")}>
          <Input id="contactPerson" name="contactPerson" defaultValue={initial?.contactPerson ?? ""} autoComplete="off" />
        </Field>
        <Field label={t("partners.form.contacts")} htmlFor="contacts">
          <Input id="contacts" name="contacts" defaultValue={initial?.contacts ?? ""} autoComplete="off" placeholder="телефон, email, Telegram…" />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("partners.form.contractStart")} htmlFor="contractStart">
          <Input id="contractStart" type="date" name="contractStart" defaultValue={d(initial?.contractStart ?? null)} />
        </Field>
        <Field label={t("partners.form.contractEnd")} htmlFor="contractEnd">
          <Input id="contractEnd" type="date" name="contractEnd" defaultValue={d(initial?.contractEnd ?? null)} />
        </Field>
      </div>

      <Field label={t("partners.form.responsible")} htmlFor="responsible">
        <Input id="responsible" name="responsible" defaultValue={initial?.responsible ?? ""} autoComplete="off" />
      </Field>

      <TranslationFields fields={PARTNER_TRANSLATION_FIELDS} initial={initial?.translations} />

      <div>
        <input type="hidden" name="logoUrl" value={logoUrl} />
        <ImageUploadField
          value={logoUrl}
          onChange={setLogoUrl}
          purpose="card"
          aspect={1}
          label={t("partners.form.logoLabel")}
          hint={t("partners.form.logoHint")}
          locale={locale}
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
            {t("partners.form.createAccountLabel")}
          </label>
          <p className="text-xs text-ink-muted">
            {t("partners.form.createAccountHint")}
          </p>

          {makeAccount && (
            <div className="space-y-2 pt-1">
              <Field
                label={t("partners.form.contractorLogin")}
                htmlFor="contractorLogin"
                hint={t("partners.form.contractorLoginHint")}
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
                      {t("partners.form.fromName")}
                    </Button>
                  )}
                </div>
              </Field>
              <p className="text-xs text-ink-muted">
                {t("partners.form.otpHint")}
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
          {t("partners.form.cancel")}
        </Link>
      </div>
    </form>
  );
}
