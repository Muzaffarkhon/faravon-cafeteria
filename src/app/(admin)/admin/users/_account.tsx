"use client";

import { useActionState, useState, useTransition } from "react";
import type { Role } from "@prisma/client";
import { PERMISSION_LABELS, ROLE_LABELS, permissionsForRoles } from "@/lib/rbac";
import { Badge, Button, Field, Input, RowId } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { RolePicker } from "./_form";
import { RowContextMenu } from "./_row-menu";
import {
  createAccountForEmployee,
  createServiceAccount,
  issuePassword,
  setAccountActive,
  setEmployeeActive,
  setServicePartner,
  setUserRoles,
  setUserTelegramId,
  type AccountResult,
} from "./actions";
import { ALL_ROLES } from "./roles";

type PartnerOption = { id: string; name: string };

/** Ловит непойманные исключения серверных экшенов — иначе кнопка молча ничего не делает. */
async function safeRun(p: Promise<AccountResult>, errorMsg: string): Promise<AccountResult> {
  try {
    return await p;
  } catch {
    return { error: errorMsg };
  }
}

function OtpBanner({ otp, login, locale }: { otp: string; login?: string; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  return (
    <div className="rounded-md border border-line bg-surface px-4 py-3 text-sm">
      <p className="text-ink-muted">
        {login ? (
          <>
            {t("users.acc.createdPrefix")} <b className="text-ink">{login}</b> {t("users.acc.createdSuffix")}
          </>
        ) : (
          <>{t("users.acc.otpOnly")}</>
        )}{" "}
        {t("users.acc.otpValidHint")}
      </p>
      <p className="mt-1 font-mono text-lg font-semibold text-primary-strong">{otp}</p>
      <p className="mt-1 text-xs text-ink-muted">
        {t("users.acc.mustChangeHint")}
      </p>
    </div>
  );
}

/* --------------------------------------------- учётная запись сотрудника --- */

export function AccountPanel({
  employeeId,
  user,
  locale,
}: {
  employeeId: string;
  user: {
    id: string;
    login: string;
    roles: Role[];
    isActive: boolean;
    mustChangePassword: boolean;
    lastLoginAt: string | null;
  } | null;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<AccountResult | null>(null);

  if (!user) {
    return (
      <form
        action={(fd) => {
          setMsg(null);
          start(async () => setMsg(await safeRun(createAccountForEmployee(employeeId, fd), t("users.acc.actionFailed"))));
        }}
        className="max-w-md space-y-4"
      >
        <p className="text-sm text-ink-muted">
          {t("users.acc.noAccountHint")}
        </p>
        <Field label={t("users.acc.loginLabel")} htmlFor="acc-login" hint={t("users.acc.loginHint")}>
          <Input id="acc-login" name="login" autoCapitalize="none" spellCheck={false} required />
        </Field>
        <RolePicker defaultRoles={["EMPLOYEE"]} locale={locale} />
        {msg?.error && (
          <p className="text-sm font-medium text-danger" role="alert">
            {msg.error}
          </p>
        )}
        {msg?.otp && <OtpBanner otp={msg.otp} locale={locale} />}
        <Button type="submit" loading={pending}>
          {pending ? t("users.acc.creating") : t("users.acc.createAccount")}
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[160px_1fr]">
        <dt className="text-ink-muted">{t("users.acc.loginLabel")}</dt>
        <dd className="font-medium text-ink">{user.login}</dd>
        <dt className="text-ink-muted">{t("users.acc.loginStatus")}</dt>
        <dd>
          {user.isActive ? (
            <Badge tone="success">{t("users.acc.active")}</Badge>
          ) : (
            <Badge tone="muted">{t("users.acc.disabled")}</Badge>
          )}
          {user.mustChangePassword && (
            <span className="ml-2 text-xs text-warning-strong">{t("users.acc.awaitingPasswordChange")}</span>
          )}
        </dd>
        <dt className="text-ink-muted">{t("users.acc.lastLogin")}</dt>
        <dd className="text-ink-muted">
          {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("ru-RU") : t("users.acc.neverLoggedIn")}
        </dd>
      </dl>

      <RoleEditor userId={user.id} roles={user.roles} locale={locale} />

      <div className="flex flex-wrap items-center gap-3 border-t border-line-subtle pt-4">
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => {
            setMsg(null);
            start(async () => setMsg(await safeRun(issuePassword(user.id), t("users.acc.actionFailed"))));
          }}
        >
          {t("users.acc.issuePassword")}
        </Button>
        <Button
          variant={user.isActive ? "danger" : "success"}
          size="sm"
          disabled={pending}
          onClick={() => {
            setMsg(null);
            start(async () => setMsg(await safeRun(setAccountActive(user.id, !user.isActive), t("users.acc.actionFailed"))));
          }}
        >
          {user.isActive ? t("users.acc.disableLogin") : t("users.acc.enableLogin")}
        </Button>
      </div>

      {msg?.error && (
        <p className="text-sm font-medium text-danger" role="alert">
          {msg.error}
        </p>
      )}
      {msg?.otp && <OtpBanner otp={msg.otp} locale={locale} />}
    </div>
  );
}

export function RoleEditor({ userId, roles, locale }: { userId: string; roles: Role[]; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [pending, start] = useTransition();
  const [sel, setSel] = useState<Role[]>(roles);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dirty =
    sel.length !== roles.length || sel.some((r) => !roles.includes(r));
  const grants = permissionsForRoles(sel);

  const toggleRole = (r: Role) => {
    setSaved(false);
    setErr(null);
    setSel((cur) => {
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
    <div className="space-y-2">
      <p className="text-sm font-medium text-ink">{t("users.acc.roles")}</p>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {ALL_ROLES.map((r) => (
          <label key={r} className="flex items-center gap-2 text-sm text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={sel.includes(r)}
              onChange={() => toggleRole(r)}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            {ROLE_LABELS[r]}
          </label>
        ))}
      </div>

      <div className="rounded-md border border-line-subtle bg-surface-muted/40 px-3 py-2">
        <p className="text-xs font-medium text-ink-muted">{t("users.acc.accessWithRoles")}</p>
        {grants.length ? (
          <ul className="mt-1 flex flex-wrap gap-1">
            {grants.map((p) => (
              <li
                key={p}
                className="rounded bg-surface px-1.5 py-0.5 text-xs text-ink ring-1 ring-line"
              >
                {PERMISSION_LABELS[p]}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-ink-subtle">
            {t("users.acc.noRolesSelected")}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={!dirty || pending}
          onClick={() =>
            start(async () => {
              const r = await safeRun(setUserRoles(userId, sel), t("users.acc.actionFailed"));
              if (r.error) setErr(r.error);
              else {
                setErr(null);
                setSaved(true);
              }
            })
          }
        >
          {t("users.acc.saveRoles")}
        </Button>
        {saved && <span className="text-xs font-medium text-success-strong">{t("users.acc.rolesUpdated")}</span>}
        {err && (
          <span className="text-xs font-medium text-danger" role="alert">
            {err}
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------ офбординг сотрудника --- */

export function EmployeeActiveToggle({
  employeeId,
  isActive,
  locale,
}: {
  employeeId: string;
  isActive: boolean;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function toggle() {
    setErr(null);
    start(async () => {
      const r = await safeRun(setEmployeeActive(employeeId, !isActive), t("users.acc.actionFailed"));
      if (r.error) setErr(r.error);
      setConfirming(false);
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant={isActive ? "danger" : "success"}
        size="sm"
        disabled={pending}
        onClick={() => (isActive ? setConfirming(true) : toggle())}
      >
        {isActive ? t("users.acc.deactivateEmployee") : t("users.acc.returnActive")}
      </Button>
      <ConfirmDialog
        open={confirming}
        title={t("users.acc.deactivateConfirmTitle")}
        message={t("users.acc.deactivateConfirmMessage")}
        confirmLabel={t("users.acc.deactivate")}
        tone="danger"
        busy={pending}
        onConfirm={toggle}
        onClose={() => setConfirming(false)}
      />
      {err && (
        <span className="text-xs font-medium text-danger" role="alert">
          {err}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------ служебные учётные записи --- */

export function ServiceAccountRow({
  user,
  partners,
  locale,
}: {
  user: {
    id: string;
    seq: number;
    login: string;
    roles: Role[];
    isActive: boolean;
    partnerId: string | null;
    partnerName: string | null;
    telegramId: string | null;
    lastLoginAt: Date | null;
  };
  partners: PartnerOption[];
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<AccountResult | null>(null);
  const [tg, setTg] = useState(user.telegramId ?? "");
  const [showRoles, setShowRoles] = useState(false);
  const isContractor = user.roles.includes("CONTRACTOR");

  return (
    <>
      <tr>
        <td>
          <RowId id={user.id} seq={user.seq} />
        </td>
        <td>
          <Badge tone="neutral">{t("users.acc.serviceAccount")}</Badge>
        </td>
        <td>
          <span className="font-medium text-ink">{user.login}</span>
          <span className="ml-1.5 text-xs text-ink-muted">
            ({user.roles.map((r) => ROLE_LABELS[r]).join(", ")})
          </span>
        </td>
        <td className="text-ink-muted">—</td>
        <td className="text-ink-muted">—</td>
        <td className="text-ink-muted">
          {isContractor ? (
            <select
              value={user.partnerId ?? ""}
              disabled={pending}
              onChange={(e) => {
                setMsg(null);
                const v = e.target.value || null;
                start(async () => setMsg(await safeRun(setServicePartner(user.id, v), t("users.acc.actionFailed"))));
              }}
              className="rounded-md border border-line-strong bg-surface px-2 py-1 text-sm text-ink outline-none"
            >
              <option value="">{t("users.acc.allPartners")}</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : (
            "—"
          )}
        </td>
        <td>
          {user.isActive ? (
            <Badge tone="success">{t("users.acc.active")}</Badge>
          ) : (
            <Badge tone="muted">{t("users.acc.disabled")}</Badge>
          )}
        </td>
        <td className="whitespace-nowrap text-xs text-ink-muted" data-numeric>
          {user.lastLoginAt
            ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(user.lastLoginAt)
            : "—"}
        </td>
        <td className="text-ink-muted">—</td>
        <td>
          <div className="flex items-center justify-end gap-2">
            <input
              value={tg}
              onChange={(e) => setTg(e.target.value)}
              placeholder={t("users.acc.telegramIdPlaceholder")}
              inputMode="numeric"
              className="w-28 rounded-md border border-line-strong bg-surface px-2 py-1 text-sm text-ink outline-none"
              title={t("users.acc.telegramIdHint")}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={pending || tg === (user.telegramId ?? "")}
              onClick={() => {
                setMsg(null);
                start(async () => setMsg(await safeRun(setUserTelegramId(user.id, tg), t("users.acc.actionFailed"))));
              }}
            >
              TG
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => {
                setMsg(null);
                start(async () => setMsg(await safeRun(issuePassword(user.id), t("users.acc.actionFailed"))));
              }}
            >
              {t("users.acc.password")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => setShowRoles((v) => !v)}
            >
              {t("users.acc.roles")}
            </Button>
            <Button
              variant={user.isActive ? "danger" : "success"}
              size="sm"
              disabled={pending}
              onClick={() => {
                setMsg(null);
                start(async () => setMsg(await safeRun(setAccountActive(user.id, !user.isActive), t("users.acc.actionFailed"))));
              }}
            >
              {user.isActive ? t("users.acc.disable") : t("users.acc.enable")}
            </Button>
            <RowContextMenu kind="service" id={user.id} name={user.login} locale={locale} />
          </div>
        </td>
      </tr>
      {showRoles && (
        <tr>
          <td colSpan={10} className="border-t border-line-subtle bg-surface-muted/40 px-4 py-3">
            <RoleEditor userId={user.id} roles={user.roles} locale={locale} />
          </td>
        </tr>
      )}
      {(msg?.otp || msg?.error) && (
        <tr>
          <td colSpan={10} className="px-4 pb-3">
            {msg.error ? (
              <span className="text-xs font-medium text-danger" role="alert">
                {msg.error}
              </span>
            ) : (
              <OtpBanner otp={msg.otp!} login={user.login} locale={locale} />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export function NewServiceAccount({
  partners,
  embedded = false,
  locale,
}: {
  partners: PartnerOption[];
  /** true — форма раскрыта сразу, без кнопки-открывашки и «Закрыть» (для единого шага создания). */
  embedded?: boolean;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [open, setOpen] = useState(embedded);
  const [state, formAction, pending] = useActionState<AccountResult, FormData>(
    createServiceAccount,
    {},
  );

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {t("users.acc.addServiceAccount")}
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      className={
        embedded
          ? "max-w-xl space-y-4"
          : "max-w-md space-y-4 rounded-md border border-line-subtle p-4"
      }
    >
      {!embedded && (
        <>
          <p className="text-sm font-medium text-ink">{t("users.acc.serviceAccountTitle")}</p>
          <p className="text-xs text-ink-muted">
            {t("users.acc.serviceAccountHint")}
          </p>
        </>
      )}
      <Field label={t("users.acc.loginLabel")} htmlFor="svc-login">
        <Input id="svc-login" name="login" autoCapitalize="none" spellCheck={false} required />
      </Field>
      <RolePicker defaultRoles={["C_AND_B"]} locale={locale} />
      <Field
        label={t("users.acc.partnerLabel")}
        htmlFor="svc-partner"
        hint={t("users.acc.partnerHint")}
      >
        <select
          id="svc-partner"
          name="partnerId"
          defaultValue=""
          className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none"
        >
          <option value="">{t("users.acc.allPartners")}</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      {state.error && (
        <p className="text-sm font-medium text-danger" role="alert">
          {state.error}
        </p>
      )}
      {state.otp && <OtpBanner otp={state.otp} locale={locale} />}
      <div className="flex gap-3">
        <Button type="submit" loading={pending}>
          {pending ? t("users.acc.creating") : t("users.acc.create")}
        </Button>
        {!embedded && (
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t("users.acc.close")}
          </Button>
        )}
      </div>
    </form>
  );
}
