"use client";

import { useActionState, useState, useTransition } from "react";
import type { Role } from "@prisma/client";
import { PERMISSION_LABELS, ROLE_LABELS, permissionsForRoles } from "@/lib/rbac";
import { Badge, Button, ConfirmDialog, Field, Input, RowId } from "@/components/ui";
import { RolePicker } from "./_form";
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

function OtpBanner({ otp, login }: { otp: string; login?: string }) {
  return (
    <div className="rounded-md border border-line bg-surface px-4 py-3 text-sm">
      <p className="text-ink-muted">
        {login ? (
          <>
            Учётная запись <b className="text-ink">{login}</b> создана. Одноразовый пароль
          </>
        ) : (
          <>Одноразовый пароль</>
        )}{" "}
        (действует 24&nbsp;ч, показывается один раз):
      </p>
      <p className="mt-1 font-mono text-lg font-semibold text-primary-strong">{otp}</p>
      <p className="mt-1 text-xs text-ink-muted">
        При первом входе система потребует сменить пароль.
      </p>
    </div>
  );
}

/* --------------------------------------------- учётная запись сотрудника --- */

export function AccountPanel({
  employeeId,
  user,
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
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<AccountResult | null>(null);

  if (!user) {
    return (
      <form
        action={(fd) => {
          setMsg(null);
          start(async () => setMsg(await createAccountForEmployee(employeeId, fd)));
        }}
        className="max-w-md space-y-4"
      >
        <p className="text-sm text-ink-muted">
          У сотрудника ещё нет учётной записи для входа на платформу.
        </p>
        <Field label="Логин" htmlFor="acc-login" hint="Латиница, цифры, «.», «-», «_».">
          <Input id="acc-login" name="login" autoCapitalize="none" spellCheck={false} required />
        </Field>
        <RolePicker defaultRoles={["EMPLOYEE"]} />
        {msg?.error && (
          <p className="text-sm font-medium text-danger" role="alert">
            {msg.error}
          </p>
        )}
        {msg?.otp && <OtpBanner otp={msg.otp} />}
        <Button type="submit" loading={pending}>
          {pending ? "Создание…" : "Создать учётную запись"}
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[160px_1fr]">
        <dt className="text-ink-muted">Логин</dt>
        <dd className="font-medium text-ink">{user.login}</dd>
        <dt className="text-ink-muted">Статус входа</dt>
        <dd>
          {user.isActive ? (
            <Badge tone="success">активна</Badge>
          ) : (
            <Badge tone="muted">отключена</Badge>
          )}
          {user.mustChangePassword && (
            <span className="ml-2 text-xs text-warning-strong">ожидает смены пароля</span>
          )}
        </dd>
        <dt className="text-ink-muted">Последний вход</dt>
        <dd className="text-ink-muted">
          {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("ru-RU") : "не входил"}
        </dd>
      </dl>

      <RoleEditor userId={user.id} roles={user.roles} />

      <div className="flex flex-wrap items-center gap-3 border-t border-line-subtle pt-4">
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => {
            setMsg(null);
            start(async () => setMsg(await issuePassword(user.id)));
          }}
        >
          Выдать одноразовый пароль
        </Button>
        <Button
          variant={user.isActive ? "danger" : "success"}
          size="sm"
          disabled={pending}
          onClick={() => {
            setMsg(null);
            start(async () => setMsg(await setAccountActive(user.id, !user.isActive)));
          }}
        >
          {user.isActive ? "Отключить вход" : "Включить вход"}
        </Button>
      </div>

      {msg?.error && (
        <p className="text-sm font-medium text-danger" role="alert">
          {msg.error}
        </p>
      )}
      {msg?.otp && <OtpBanner otp={msg.otp} />}
    </div>
  );
}

function RoleEditor({ userId, roles }: { userId: string; roles: Role[] }) {
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
      <p className="text-sm font-medium text-ink">Роли</p>
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
        <p className="text-xs font-medium text-ink-muted">Доступ с выбранными ролями</p>
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
            Ролей не выбрано — доступа к разделам нет.
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={!dirty || pending}
          onClick={() =>
            start(async () => {
              const r = await setUserRoles(userId, sel);
              if (r.error) setErr(r.error);
              else {
                setErr(null);
                setSaved(true);
              }
            })
          }
        >
          Сохранить роли
        </Button>
        {saved && <span className="text-xs font-medium text-success-strong">Роли обновлены.</span>}
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
}: {
  employeeId: string;
  isActive: boolean;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function toggle() {
    setErr(null);
    start(async () => {
      const r = await setEmployeeActive(employeeId, !isActive);
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
        {isActive ? "Деактивировать сотрудника" : "Вернуть в активные"}
      </Button>
      {confirming && (
        <ConfirmDialog
          title="Деактивировать сотрудника?"
          message="Вход в его учётную запись будет закрыт немедленно."
          confirmLabel="Деактивировать"
          pending={pending}
          onConfirm={toggle}
          onCancel={() => setConfirming(false)}
        />
      )}
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
}: {
  user: {
    id: string;
    login: string;
    roles: Role[];
    isActive: boolean;
    partnerId: string | null;
    partnerName: string | null;
    telegramId: string | null;
  };
  partners: PartnerOption[];
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<AccountResult | null>(null);
  const [tg, setTg] = useState(user.telegramId ?? "");
  const isContractor = user.roles.includes("CONTRACTOR");

  return (
    <>
      <tr>
        <td>
          <RowId id={user.id} />
        </td>
        <td>
          <Badge tone="neutral">Служебная</Badge>
        </td>
        <td>
          <span className="font-medium text-ink">{user.login}</span>
          <span className="ml-1.5 text-xs text-ink-muted">
            ({user.roles.map((r) => ROLE_LABELS[r]).join(", ")})
          </span>
        </td>
        <td className="text-ink-muted">—</td>
        <td className="text-ink-muted">
          {isContractor ? (
            <select
              value={user.partnerId ?? ""}
              disabled={pending}
              onChange={(e) => {
                setMsg(null);
                const v = e.target.value || null;
                start(async () => setMsg(await setServicePartner(user.id, v)));
              }}
              className="rounded-md border border-line-strong bg-surface px-2 py-1 text-sm text-ink outline-none"
            >
              <option value="">Все партнёры</option>
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
            <Badge tone="success">активна</Badge>
          ) : (
            <Badge tone="muted">отключена</Badge>
          )}
        </td>
        <td>
          <div className="flex items-center justify-end gap-2">
            <input
              value={tg}
              onChange={(e) => setTg(e.target.value)}
              placeholder="Telegram ID"
              inputMode="numeric"
              className="w-28 rounded-md border border-line-strong bg-surface px-2 py-1 text-sm text-ink outline-none"
              title="Telegram ID для уведомлений (узнать: /id в боте)"
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={pending || tg === (user.telegramId ?? "")}
              onClick={() => {
                setMsg(null);
                start(async () => setMsg(await setUserTelegramId(user.id, tg)));
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
                start(async () => setMsg(await issuePassword(user.id)));
              }}
            >
              Пароль
            </Button>
            <Button
              variant={user.isActive ? "danger" : "success"}
              size="sm"
              disabled={pending}
              onClick={() => {
                setMsg(null);
                start(async () => setMsg(await setAccountActive(user.id, !user.isActive)));
              }}
            >
              {user.isActive ? "Отключить" : "Включить"}
            </Button>
          </div>
        </td>
      </tr>
      {(msg?.otp || msg?.error) && (
        <tr>
          <td colSpan={7} className="px-4 pb-3">
            {msg.error ? (
              <span className="text-xs font-medium text-danger" role="alert">
                {msg.error}
              </span>
            ) : (
              <OtpBanner otp={msg.otp!} login={user.login} />
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
}: {
  partners: PartnerOption[];
  /** true — форма раскрыта сразу, без кнопки-открывашки и «Закрыть» (для единого шага создания). */
  embedded?: boolean;
}) {
  const [open, setOpen] = useState(embedded);
  const [state, formAction, pending] = useActionState<AccountResult, FormData>(
    createServiceAccount,
    {},
  );

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Добавить служебную учётную запись
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
          <p className="text-sm font-medium text-ink">Служебная учётная запись</p>
          <p className="text-xs text-ink-muted">
            Для C&B, подрядчиков и других ролей без карточки сотрудника.
          </p>
        </>
      )}
      <Field label="Логин" htmlFor="svc-login">
        <Input id="svc-login" name="login" autoCapitalize="none" spellCheck={false} required />
      </Field>
      <RolePicker defaultRoles={["C_AND_B"]} />
      <Field
        label="Партнёр"
        htmlFor="svc-partner"
        hint="Только для роли «Подрядчик»: учётка будет активировать купоны лишь этого партнёра. «Все партнёры» — без ограничения."
      >
        <select
          id="svc-partner"
          name="partnerId"
          defaultValue=""
          className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none"
        >
          <option value="">Все партнёры</option>
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
      {state.otp && <OtpBanner otp={state.otp} />}
      <div className="flex gap-3">
        <Button type="submit" loading={pending}>
          {pending ? "Создание…" : "Создать"}
        </Button>
        {!embedded && (
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Закрыть
          </Button>
        )}
      </div>
    </form>
  );
}
