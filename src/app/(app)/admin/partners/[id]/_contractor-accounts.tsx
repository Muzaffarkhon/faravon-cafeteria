"use client";

import { useActionState, useState, useTransition } from "react";
import { Badge, Button, Field, Input } from "@/components/ui";
import { OtpModal } from "../../users/_otp-modal";
import { loginFromPartnerName } from "@/lib/translit";
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
}: {
  partnerId: string;
  partnerName: string;
  accounts: ContractorAccount[];
}) {
  const [showAddForm, setShowAddForm] = useState(accounts.length === 0);
  const [activeOtp, setActiveOtp] = useState<{ otp: string; login?: string } | null>(null);

  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm space-y-4">
      {activeOtp && (
        <OtpModal
          otp={activeOtp.otp}
          login={activeOtp.login}
          permanent
          onClose={() => setActiveOtp(null)}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink">
            Учётные записи подрядчика
          </h2>
          <p className="text-xs text-ink-muted">
            Используются кассирами и администраторами партнёра для активации купонов и рекламы.
          </p>
        </div>
        {accounts.length > 0 && !showAddForm && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setShowAddForm(true)}
          >
            + Добавить учётку
          </Button>
        )}
      </div>

      {accounts.length === 0 && !showAddForm && (
        <div className="rounded-xl border border-dashed border-line-subtle p-6 text-center">
          <p className="text-sm text-ink-muted">У этого партнёра ещё нет учётной записи.</p>
          <Button
            type="button"
            size="sm"
            className="mt-3"
            onClick={() => setShowAddForm(true)}
          >
            Создать учётку для кассира
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
              onOtpIssued={(otp) => setActiveOtp({ otp, login: acc.login })}
            />
          ))}
        </div>
      )}

      {showAddForm && (
        <NewAccountCard
          partnerId={partnerId}
          partnerName={partnerName}
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
  onOtpIssued,
}: {
  account: ContractorAccount;
  partnerId: string;
  onOtpIssued: (otp: string) => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-surface">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-ink">{account.login}</span>
          <Badge tone={account.isActive ? "success" : "warning"}>
            {account.isActive ? "Активен" : "Заблокирован"}
          </Badge>
          <Badge tone="neutral">Роль: Подрядчик</Badge>
        </div>
        <p className="text-xs text-ink-subtle">
          Создан: {new Date(account.createdAt).toLocaleDateString("ru-RU")}
        </p>
      </div>

      <div className="flex items-center gap-2">
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
          Выдать новый PIN
        </Button>

        <Button
          type="button"
          variant={account.isActive ? "danger" : "success"}
          size="sm"
          disabled={pending}
          onClick={() => {
            if (account.isActive && !confirm(`Заблокировать вход для «${account.login}»?`)) return;
            setErr(null);
            start(async () => {
              const res = await setPartnerAccountActive(account.id, partnerId, !account.isActive);
              if (res.error) setErr(res.error);
            });
          }}
        >
          {account.isActive ? "Отключить" : "Включить"}
        </Button>
      </div>

      {err && <p className="text-xs font-medium text-danger">{err}</p>}
    </div>
  );
}

function NewAccountCard({
  partnerId,
  partnerName,
  onCancel,
  onSuccess,
}: {
  partnerId: string;
  partnerName: string;
  onCancel?: () => void;
  onSuccess: (login: string, otp: string) => void;
}) {
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
      <p className="text-sm font-medium text-ink">Новая учётная запись подрядчика</p>
      <Field
        label="Логин"
        htmlFor="new-contractor-login"
        hint="Логин для входа (только латиница, цифры, дефис, подчёркивание)."
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
          Создать точку и получить PIN
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Отмена
          </Button>
        )}
      </div>
    </form>
  );
}
