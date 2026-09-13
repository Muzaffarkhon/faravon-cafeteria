"use client";

import { useActionState, useState, useTransition } from "react";
import { Badge, Button, Field, Input } from "@/components/ui";
import { OtpModal } from "../../users/_otp-modal";
import { loginFromPartnerName } from "@/lib/translit";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import {
  createPartnerContractorAccount,
  issuePartnerAccountOtp,
  setPartnerAccountActive,
  type PartnerAccountResult,
} from "../actions";

export type ContractorAccount = {
  id: string;
  login: string;
  isActive: boolean;
  createdAt: Date | string;
};

export function PartnerContractorAccounts({
  partnerId,
  partnerName,
  accounts,
  locale,
}: {
  partnerId: string;
  partnerName: string;
  accounts: ContractorAccount[];
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [showAddForm, setShowAddForm] = useState(accounts.length === 0);
  const [activeOtp, setActiveOtp] = useState<{ otp: string; login?: string } | null>(null);

  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm space-y-4">
      {activeOtp && (
        <OtpModal
          otp={activeOtp.otp}
          login={activeOtp.login}
          permanent
          locale={locale}
          onClose={() => setActiveOtp(null)}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink">
            {t("partners.accountsTitle")}
          </h2>
          <p className="text-xs text-ink-muted">
            {t("partners.accountsHint")}
          </p>
        </div>
        {accounts.length > 0 && !showAddForm && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setShowAddForm(true)}
          >
            {t("partners.addAccount")}
          </Button>
        )}
      </div>

      {accounts.length === 0 && !showAddForm && (
        <div className="rounded-xl border border-dashed border-line-subtle p-6 text-center">
          <p className="text-sm text-ink-muted">{t("partners.noAccountsYet")}</p>
          <Button
            type="button"
            size="sm"
            className="mt-3"
            onClick={() => setShowAddForm(true)}
          >
            {t("partners.createCashierAccount")}
          </Button>
        </div>
      )}

      {accounts.length > 0 && (
        <div className="divide-y divide-line-subtle rounded-xl border border-line-subtle overflow-hidden">
          {accounts.map((acc) => (
            <AccountRow
              key={acc.id}
              account={acc}
              partnerId={partnerId}
              locale={locale}
              onOtpIssued={(otp) => setActiveOtp({ otp, login: acc.login })}
            />
          ))}
        </div>
      )}

      {showAddForm && (
        <NewAccountCard
          partnerId={partnerId}
          partnerName={partnerName}
          locale={locale}
          onCancel={accounts.length > 0 ? () => setShowAddForm(false) : undefined}
          onSuccess={(login, otp) => {
            setShowAddForm(false);
            setActiveOtp({ otp, login });
          }}
        />
      )}
    </div>
  );
}

function AccountRow({
  account,
  partnerId,
  locale,
  onOtpIssued,
}: {
  account: ContractorAccount;
  partnerId: string;
  locale: Locale;
  onOtpIssued: (otp: string) => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-surface">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="break-all font-mono font-bold text-ink">{account.login}</span>
          <Badge tone={account.isActive ? "success" : "warning"}>
            {account.isActive ? t("partners.active") : t("partners.blocked")}
          </Badge>
          <Badge tone="neutral">{t("partners.contractor")}</Badge>
        </div>
        <p className="text-xs text-ink-subtle">
          {t("partners.createdOn")} {new Date(account.createdAt).toLocaleDateString("ru-RU")}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => {
            setErr(null);
            start(async () => {
              const res = await issuePartnerAccountOtp(account.id, partnerId);
              if (res.error) setErr(res.error);
              else if (res.otp) onOtpIssued(res.otp);
            });
          }}
        >
          {t("partners.issueNewPin")}
        </Button>

        <Button
          type="button"
          variant={account.isActive ? "danger" : "success"}
          size="sm"
          disabled={pending}
          onClick={() => {
            if (account.isActive && !confirm(`${t("partners.blockLoginConfirmPrefix")}${account.login}${t("partners.blockLoginConfirmSuffix")}`)) return;
            setErr(null);
            start(async () => {
              const res = await setPartnerAccountActive(account.id, partnerId, !account.isActive);
              if (res.error) setErr(res.error);
            });
          }}
        >
          {account.isActive ? t("partners.disable") : t("partners.enable")}
        </Button>
      </div>

      {err && <p className="w-full text-xs font-medium text-danger">{err}</p>}
    </div>
  );
}

function NewAccountCard({
  partnerId,
  partnerName,
  locale,
  onCancel,
  onSuccess,
}: {
  partnerId: string;
  partnerName: string;
  locale: Locale;
  onCancel?: () => void;
  onSuccess: (login: string, otp: string) => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const action = createPartnerContractorAccount.bind(null, partnerId);
  const [state, formAction, pending] = useActionState<PartnerAccountResult, FormData>(
    async (prev, fd) => {
      const res = await action(prev, fd);
      if (res.ok && res.login && res.otp) {
        onSuccess(res.login, res.otp);
      }
      return res;
    },
    {},
  );

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-xl border border-line-subtle bg-surface-muted/40 p-4"
    >
      <p className="text-sm font-medium text-ink">{t("partners.newContractorAccount")}</p>
      <Field
        label={t("partners.login")}
        htmlFor="new-contractor-login"
        hint={t("partners.loginHint")}
      >
        <Input
          id="new-contractor-login"
          name="login"
          defaultValue={loginFromPartnerName(partnerName)}
          autoCapitalize="none"
          spellCheck={false}
          required
        />
      </Field>

      {state.error && (
        <p className="text-xs font-medium text-danger" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" loading={pending}>
          {t("partners.createPointAndPin")}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {t("partners.cancel")}
          </Button>
        )}
      </div>
    </form>
  );
}
